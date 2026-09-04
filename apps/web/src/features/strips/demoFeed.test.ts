import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { stripsSlice, stripsActions } from './slice';
import { createDemoFeed } from './demoFeed';

function makeStore() {
  return configureStore({ reducer: { strips: stripsSlice.reducer } });
}

describe('createDemoFeed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('verifies the TAP1901 squawk at the first scheduled event (happy)', () => {
    const store = makeStore();
    const feed = createDemoFeed(store);
    feed.start();
    vi.advanceTimersByTime(8000);
    const p4 = store.getState().strips.tabs.LPPT.strips.find((s) => s.id === 'p4');
    expect(p4?.sqkS).toBe('3726');
    feed.stop();
  });

  it('adds the IBE3117 flight plan at the second event (happy)', () => {
    const store = makeStore();
    const feed = createDemoFeed(store);
    feed.start();
    vi.advanceTimersByTime(20000);
    expect(store.getState().strips.tabs.LPPT.strips[0].cs).toBe('IBE3117');
    feed.stop();
  });

  it('does not fire while the live feed is off (invalid)', () => {
    const store = makeStore();
    store.dispatch(stripsActions.feedToggled(false));
    const feed = createDemoFeed(store);
    feed.start();
    vi.advanceTimersByTime(120000);
    const p4 = store.getState().strips.tabs.LPPT.strips.find((s) => s.id === 'p4');
    expect(p4?.sqkS).toBe('');
    feed.stop();
  });

  it('survives events whose targets were removed by the user (garbage)', () => {
    const store = makeStore();
    // Delete every LPPT strip the schedule touches before it runs.
    for (const id of ['p2', 'p4', 'p5', 'p6', 'p7', 'p8']) {
      store.dispatch(stripsActions.stripDeleted(id));
    }
    const feed = createDemoFeed(store);
    feed.start();
    expect(() => vi.advanceTimersByTime(120000)).not.toThrow();
    feed.stop();
  });

  it('stops cleanly and never fires afterwards (happy)', () => {
    const store = makeStore();
    const feed = createDemoFeed(store);
    feed.start();
    feed.stop();
    vi.advanceTimersByTime(120000);
    const p4 = store.getState().strips.tabs.LPPT.strips.find((s) => s.id === 'p4');
    expect(p4?.sqkS).toBe('');
  });
});
