import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface ConsoleMessage {
  id: string;
  direction: 'in' | 'out';
  envelope: Record<string, unknown>;
}

export interface GatewayBatch {
  messages: ConsoleMessage[];
  cursor: string | null;
  reset: boolean;
  pluginConnected: boolean;
}

export interface GatewayState {
  messages: ConsoleMessage[];
  cursor: string | null;
  pluginConnected: boolean;
  pollStatus: 'connecting' | 'live' | 'backoff';
}

// Server ring holds 200; the client cap only guards long-lived tabs.
const MAX_MESSAGES = 500;

const initialState: GatewayState = {
  messages: [],
  cursor: null,
  pluginConnected: false,
  pollStatus: 'connecting',
};

export const gatewaySlice = createSlice({
  name: 'gateway',
  initialState,
  reducers: {
    batchReceived(state, action: PayloadAction<GatewayBatch>) {
      const { messages, cursor, reset, pluginConnected } = action.payload;
      state.pluginConnected = pluginConnected;
      state.pollStatus = 'live';
      state.messages = reset ? messages : [...state.messages, ...messages];
      if (state.messages.length > MAX_MESSAGES) {
        state.messages = state.messages.slice(state.messages.length - MAX_MESSAGES);
      }
      if (cursor) {
        state.cursor = cursor;
      }
    },
    pollFailed(state) {
      state.pollStatus = 'backoff';
    },
  },
});

export const { batchReceived, pollFailed } = gatewaySlice.actions;
