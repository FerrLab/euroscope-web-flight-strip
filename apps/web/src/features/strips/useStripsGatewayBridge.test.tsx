import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { makeStore, type AppStore } from '@/shared/store/index';
import { stripsActions } from './slice';
import { useStripsGatewayBridge } from './useStripsGatewayBridge';

function Bridge() {
  useStripsGatewayBridge();
  return null;
}

function pollBody(envelopes: unknown[]) {
  return {
    messages: envelopes.map((envelope, i) => ({ id: `${i}-0`, direction: 'in', envelope })),
    cursor: '1-0',
    reset: false,
    pluginConnected: true,
  };
}

function mockGateway(envelopes: unknown[]) {
  const commandCalls: unknown[] = [];
  let polls = 0;
  vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/console/poll')) {
      polls += 1;
      if (polls === 1) {
        return new Response(JSON.stringify(pollBody(envelopes)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      // Later polls hang like a real long poll.
      return new Promise<Response>(() => {});
    }
    if (url.includes('gateway/commands')) {
      commandCalls.push(
        JSON.parse(String(init?.body ?? (input instanceof Request ? await input.text() : ''))),
      );
      return new Response(JSON.stringify({ queued: {} }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  return commandCalls;
}

function renderBridge(store: AppStore) {
  return render(
    <Provider store={store}>
      <Bridge />
    </Provider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useStripsGatewayBridge', () => {
  it('maps an inbound flight_updated into a live strip (happy)', async () => {
    const store = makeStore();
    mockGateway([
      {
        type: 'event',
        action: 'flight_updated',
        callsign: 'BAW123',
        payload: {
          callsign: 'BAW123',
          origin: 'LPPT',
          destination: 'EGLL',
          aircraftType: 'A319',
          wtc: 'M',
        },
      },
    ]);
    renderBridge(store);
    await waitFor(() => {
      expect(store.getState().strips.tabs.LPPT.strips.some((s) => s.cs === 'BAW123')).toBe(true);
    });
    expect(store.getState().gateway.pluginConnected).toBe(true);
  });

  it('mirrors a user move as a set_ground_state command when connected (happy)', async () => {
    const store = makeStore();
    const commands = mockGateway([]);
    renderBridge(store);
    await waitFor(() => expect(store.getState().gateway.pluginConnected).toBe(true));

    store.dispatch(stripsActions.stripMoved({ stripId: 'p6', bayId: 'PUSHBACK', source: 'drag' }));
    await waitFor(() => {
      const moves = commands.filter((c) => (c as { action: string }).action === 'set_ground_state');
      expect(moves).toHaveLength(1);
      expect(moves[0]).toMatchObject({
        action: 'set_ground_state',
        callsign: 'TAP081',
        payload: { state: 'PUSH' },
      });
    });
  });

  it('scans the session on connect instead of waiting for events (happy)', async () => {
    const store = makeStore();
    const commands = mockGateway([]);
    renderBridge(store);
    await waitFor(() => {
      const actions = commands.map((c) => (c as { action: string }).action);
      expect(actions).toContain('list_flights');
      expect(actions).toContain('list_controllers');
    });
  });

  it('re-scans when a new airport tab opens (happy)', async () => {
    const store = makeStore();
    const commands = mockGateway([]);
    renderBridge(store);
    await waitFor(() => expect(commands.length).toBeGreaterThanOrEqual(2));
    const before = commands.length;
    store.dispatch(stripsActions.airportOpened('SBGR'));
    await waitFor(() => expect(commands.length).toBeGreaterThanOrEqual(before + 2));
  });

  it('sends nothing for a guard-rejected move (invalid)', async () => {
    const store = makeStore();
    const commands = mockGateway([]);
    renderBridge(store);
    await waitFor(() => expect(store.getState().gateway.pluginConnected).toBe(true));

    // RUNWAY holds p7 (cap 1) — the reducer refuses this move.
    store.dispatch(stripsActions.stripMoved({ stripId: 'p6', bayId: 'RUNWAY', source: 'drag' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Only the session-scan commands went out; the rejected move sent nothing.
    expect(
      commands.filter((c) => (c as { action: string }).action === 'set_ground_state'),
    ).toHaveLength(0);
  });

  it('ignores garbage envelopes without crashing (garbage)', async () => {
    const store = makeStore();
    mockGateway(['not-an-envelope', { nope: true }, 42]);
    renderBridge(store);
    await waitFor(() => expect(store.getState().gateway.pluginConnected).toBe(true));
    expect(store.getState().strips.tabs.LPPT.strips.length).toBeGreaterThan(0);
  });
});
