'use client';

import { useState, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { makeStore, type AppStore } from './index';

export function ReduxProvider({ children }: { children: ReactNode }) {
  // Lazy initializer keeps the store as a per-mount singleton without touching
  // refs during render (App Router-friendly; RSC → Client transitions reuse it).
  const [store] = useState<AppStore>(() => makeStore());
  return <Provider store={store}>{children}</Provider>;
}
