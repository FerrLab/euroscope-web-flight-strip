import { describe, it, expect } from 'vitest';
import { makeStore } from '@/shared/store/index';
import { gatewaySlice, batchReceived, pollFailed, type ConsoleMessage } from './slice';

const reducer = gatewaySlice.reducer;

function msg(id: string): ConsoleMessage {
  return { id, direction: 'in', envelope: { type: 'event', action: 'x' } };
}

describe('gatewaySlice', () => {
  it('is registered in the store (happy)', () => {
    expect(makeStore().getState().gateway.pollStatus).toBe('connecting');
  });

  it('appends batches, advances cursor, goes live (happy)', () => {
    let state = reducer(
      undefined,
      batchReceived({ messages: [msg('1-0')], cursor: '1-0', reset: false, pluginConnected: true }),
    );
    state = reducer(
      state,
      batchReceived({ messages: [msg('2-0')], cursor: '2-0', reset: false, pluginConnected: true }),
    );
    expect(state.messages.map((m) => m.id)).toEqual(['1-0', '2-0']);
    expect(state.cursor).toBe('2-0');
    expect(state.pluginConnected).toBe(true);
    expect(state.pollStatus).toBe('live');
  });

  it('replaces the feed on reset (invalid cursor recovery)', () => {
    let state = reducer(
      undefined,
      batchReceived({
        messages: [msg('1-0'), msg('2-0')],
        cursor: '2-0',
        reset: false,
        pluginConnected: false,
      }),
    );
    state = reducer(
      state,
      batchReceived({ messages: [msg('9-0')], cursor: '9-0', reset: true, pluginConnected: false }),
    );
    expect(state.messages.map((m) => m.id)).toEqual(['9-0']);
  });

  it('keeps the cursor when a poll returns none (happy timeout)', () => {
    let state = reducer(
      undefined,
      batchReceived({ messages: [msg('1-0')], cursor: '1-0', reset: false, pluginConnected: true }),
    );
    state = reducer(
      state,
      batchReceived({ messages: [], cursor: null, reset: false, pluginConnected: true }),
    );
    expect(state.cursor).toBe('1-0');
  });

  it('caps the feed at 500 messages (garbage volume)', () => {
    const many = Array.from({ length: 510 }, (_, i) => msg(`${i + 1}-0`));
    const state = reducer(
      undefined,
      batchReceived({ messages: many, cursor: '510-0', reset: false, pluginConnected: true }),
    );
    expect(state.messages).toHaveLength(500);
    expect(state.messages[0].id).toBe('11-0');
  });

  it('marks backoff on poll failure but keeps messages (invalid)', () => {
    let state = reducer(
      undefined,
      batchReceived({ messages: [msg('1-0')], cursor: '1-0', reset: false, pluginConnected: true }),
    );
    state = reducer(state, pollFailed());
    expect(state.pollStatus).toBe('backoff');
    expect(state.messages).toHaveLength(1);
  });
});
