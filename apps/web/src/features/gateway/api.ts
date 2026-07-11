import { baseApi } from '@eurostrip/api-client';
import type { CommandEnvelope } from './schema';

export interface TokenStatusDto {
  exists: boolean;
  created_at: string | null;
}

export interface RotateTokenDto {
  token: string;
  created_at: string;
}

export interface QueuedCommandDto {
  queued: Record<string, unknown>;
}

export const gatewayApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    tokenStatus: builder.query<TokenStatusDto, void>({
      query: () => 'gateway/token',
      providesTags: ['GatewayToken'],
    }),
    rotateToken: builder.mutation<RotateTokenDto, void>({
      query: () => ({ url: 'gateway/token', method: 'POST' }),
      invalidatesTags: ['GatewayToken'],
    }),
    sendCommand: builder.mutation<QueuedCommandDto, CommandEnvelope>({
      query: (body) => ({ url: 'gateway/commands', method: 'POST', body }),
    }),
  }),
});

export const { useTokenStatusQuery, useRotateTokenMutation, useSendCommandMutation } = gatewayApi;
