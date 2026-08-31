import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { baseApi } from '@eurostrip/api-client';
import { authSlice } from './slices/auth';
import { gatewaySlice } from '@/features/gateway/slice';
import { stripsSlice } from '@/features/strips/slice';

export function makeStore() {
  // Dynamic listeners (RTK addListener) — the strips gateway bridge
  // registers its outbound command mirroring here while mounted.
  const listenerMiddleware = createListenerMiddleware();
  const store = configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      auth: authSlice.reducer,
      gateway: gatewaySlice.reducer,
      strips: stripsSlice.reducer,
    },
    middleware: (getDefault) =>
      getDefault().prepend(listenerMiddleware.middleware).concat(baseApi.middleware),
  });
  setupListeners(store.dispatch);
  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
