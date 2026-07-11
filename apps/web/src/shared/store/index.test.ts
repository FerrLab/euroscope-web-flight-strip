import { describe, it, expect } from 'vitest';
import { makeStore } from './index';
import { setUser } from './slices/auth';

describe('Redux store', () => {
  it('starts with idle auth state (happy)', () => {
    const store = makeStore();
    expect(store.getState().auth.status).toBe('idle');
    expect(store.getState().auth.user).toBeNull();
  });

  it('flips to authenticated on setUser (happy)', () => {
    const store = makeStore();
    store.dispatch(setUser({ id: 1, email: 'a@b' }));
    expect(store.getState().auth.status).toBe('authenticated');
    expect(store.getState().auth.user).toEqual({ id: 1, email: 'a@b' });
  });

  it('flips to unauthenticated on setUser(null) (invalid → null)', () => {
    const store = makeStore();
    store.dispatch(setUser(null));
    expect(store.getState().auth.status).toBe('unauthenticated');
  });

  it('hosts the api reducer slot (happy — api-client integration)', () => {
    const store = makeStore();
    expect(store.getState()).toHaveProperty('api');
  });
});
