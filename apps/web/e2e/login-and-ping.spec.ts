import { test, expect } from '@playwright/test';

test('login → dashboard → create ping → list → theme + locale switch (happy)', async ({ page }) => {
  // 1. Stub-login flow.
  await page.goto('/en/login');
  await page.getByRole('link', { name: /Continue with Stub/i }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/, { timeout: 15_000 });

  // 2. Navigate to /en/ping via dashboard link and submit a ping.
  await page.getByRole('link', { name: 'Pings' }).click();
  await expect(page).toHaveURL(/\/en\/ping/);

  // Use a unique tag per run so the test is resilient to leftover rows from
  // prior gate runs (the backend isn't wiped between e2e invocations).
  const tag = `e2e-flow-${Date.now()}`;
  await page.getByLabel('Text').fill(tag);
  await page.getByRole('button', { name: 'Submit' }).click();

  // RTK Query refetches the list automatically — the new note must appear.
  await expect(page.getByRole('cell', { name: tag })).toBeVisible();

  // 3. Back to the dashboard, where the switchers live.
  await page.goto('/en/dashboard');

  // Theme switch to Night.
  await page.getByLabel('Theme').click();
  await page.getByRole('option', { name: 'Night' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');

  // 4. Locale switch to Portuguese (Português in the i18n catalog).
  await page.getByLabel('Language').click();
  await page.getByRole('option', { name: 'Português' }).click();
  await expect(page).toHaveURL(/\/pt\/dashboard/);
});
