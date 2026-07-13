import { test, expect, request as pwRequest } from '@playwright/test';
import { FakePlugin, type ProtocolEnvelope } from './support/fake-plugin';

test('login → create token → plugin event in console → command reaches plugin (happy)', async ({
  page,
}) => {
  // 1. Stub login.
  await page.goto('/en/login');
  await page.getByRole('link', { name: /Continue with Stub/i }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/, { timeout: 15_000 });

  // 2. Create (or rotate) the gateway token and capture the one-time secret.
  await page.getByRole('link', { name: 'Gateway token' }).click();
  await expect(page).toHaveURL(/\/en\/token/);

  // The backend persists across e2e runs: first run generates, later runs
  // rotate. The token-status query is async, so wait for whichever button
  // the fetch resolves to rather than sampling isVisible() immediately.
  const rotate = page.getByRole('button', { name: 'Rotate token' });
  const generate = page.getByRole('button', { name: 'Generate token' });
  await expect(rotate.or(generate)).toBeVisible({ timeout: 15_000 });
  if (await rotate.isVisible()) {
    await rotate.click();
    await page.getByRole('button', { name: 'Yes, rotate' }).click();
  } else {
    await generate.click();
  }
  const secret = (await page.getByTestId('gateway-token-secret').textContent())?.trim();
  expect(secret).toBeTruthy();

  // 3. The fake plugin pushes a flight_updated event with that token.
  const api = await pwRequest.newContext();
  const plugin = new FakePlugin(api, secret!);
  const callsign = `E2E${Date.now() % 10_000}`;
  const event: ProtocolEnvelope = {
    type: 'event',
    callsign,
    action: 'flight_updated',
    payload: { callsign, origin: 'EDDM', destination: 'EDDF' },
  };
  expect(await plugin.sendMessages([event])).toBe(204);

  // 4. The event shows up in the console feed (backfill on page load).
  await page.goto('/en/console');
  // MessageFeed renders both a summary span with the action name and a
  // collapsed <pre> with the full JSON envelope (which also contains the
  // action string) per row, so a plain text match resolves to 2+ elements.
  await expect(page.getByText('flight_updated').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(callsign).first()).toBeVisible();

  // 5. Send a set_squawk command from the composer. Structured mode is the
  // default view now, so switch to raw JSON mode first.
  await page.getByRole('button', { name: 'Raw JSON' }).click();
  await page
    .getByLabel('Command JSON')
    .fill(JSON.stringify({ action: 'set_squawk', callsign, payload: { code: '2354' } }));
  await page.getByRole('button', { name: 'Send' }).click();

  // The mirrored outbound command appears in the feed.
  await expect(page.getByText('set_squawk').first()).toBeVisible({ timeout: 20_000 });

  // 6. The fake plugin's poll receives it.
  const commands = await plugin.pollOnce(10);
  expect(commands).toHaveLength(1);
  expect(commands[0].type).toBe('command');
  expect(commands[0].action).toBe('set_squawk');
  expect(commands[0].callsign).toBe(callsign);
  expect(commands[0].payload).toEqual({ code: '2354' });
  expect(commands[0].id).toBeTruthy();

  await api.dispose();
});
