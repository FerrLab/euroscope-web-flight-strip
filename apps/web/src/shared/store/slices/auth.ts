import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface AuthUser {
  id: number;
  email: string;
}

export interface AuthState {
  user: AuthUser | null;
  status: 'idle' | 'pending' | 'authenticated' | 'unauthenticated';
}

const initialState: AuthState = {
  user: null,
  status: 'idle',
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<AuthUser | null>) {
      state.user = action.payload;
      state.status = action.payload ? 'authenticated' : 'unauthenticated';
    },
    setPending(state) {
      state.status = 'pending';
    },
  },
});

export const { setUser, setPending } = authSlice.actions;
