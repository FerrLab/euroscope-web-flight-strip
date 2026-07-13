import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { makeStore, type AppStore } from '@/shared/store/index';
import { useGatewayPoll } from './useGatewayPoll';

function makeWrapper(store: AppStore) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const batch = {
  messages: [{ id: '1-0', direction: 'in', envelope: { type: 'event', action: 'flight_updated' } }],
  cursor: '1-0',
  reset: false,
  pluginConnected: true,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useGatewayPoll', () => {
  it('dispatches the backfill then re-polls with the cursor (happy)', async () => {
    const calls: string[] = [];
    vi.spyOn(global, 'fetch').mockImplementation((input) => {
      calls.push(String(input));
      if (calls.length === 1) {
        return Promise.resolve(jsonResponse(batch));
      }
      return new Promise(() => {}); // subsequent poll hangs like a real long poll
    });

    const store = makeStore();
    renderHook(() => useGatewayPoll(), { wrapper: makeWrapper(store) });

    await waitFor(() => expect(store.getState().gateway.messages).toHaveLength(1));
    expect(store.getState().gateway.cursor).toBe('1-0');

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]).not.toContain('after=');
    expect(calls[1]).toContain('after=1-0');
  });

  it('flags backoff on failure and recovers on the next poll (invalid)', async () => {
    let count = 0;
    vi.spyOn(global, 'fetch').mockImplementation(() => {
      count++;
      if (count === 1) {
        return Promise.reject(new Error('network down'));
      }
      if (count === 2) {
        return Promise.resolve(jsonResponse(batch));
      }
      return new Promise(() => {});
    });

    const store = makeStore();
    renderHook(() => useGatewayPoll(), { wrapper: makeWrapper(store) });

    await waitFor(() => expect(store.getState().gateway.pollStatus).toBe('backoff'));
    // Backoff starts at 1s; the retry then succeeds.
    await waitFor(() => expect(store.getState().gateway.pollStatus).toBe('live'), {
      timeout: 3_000,
    });
    expect(store.getState().gateway.messages).toHaveLength(1);
  });

  it('treats non-2xx as failure (invalid)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));

    const store = makeStore();
    renderHook(() => useGatewayPoll(), { wrapper: makeWrapper(store) });

    await waitFor(() => expect(store.getState().gateway.pollStatus).toBe('backoff'));
  });

  it('stops polling on unmount (garbage teardown)', async () => {
    let count = 0;
    vi.spyOn(global, 'fetch').mockImplementation(() => {
      count++;
      return new Promise(() => {});
    });

    const store = makeStore();
    const { unmount } = renderHook(() => useGatewayPoll(), { wrapper: makeWrapper(store) });

    await waitFor(() => expect(count).toBe(1));
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(count).toBe(1);
  });

  it('does nothing when disabled (invalid)', async () => {
    const spy = vi.spyOn(global, 'fetch');

    const store = makeStore();
    renderHook(() => useGatewayPoll(false), { wrapper: makeWrapper(store) });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(spy).not.toHaveBeenCalled();
  });
});
