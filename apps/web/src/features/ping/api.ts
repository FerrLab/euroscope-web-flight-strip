import { baseApi } from '@eurostrip/api-client';
import type { RecordPingPayload } from './schema';

export interface PingDto {
  id: string;
  note: Record<string, string>;
  created_at: string;
}

export const pingApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listPings: builder.query<PingDto[], void>({
      query: () => 'ping',
      providesTags: ['Ping'],
    }),
    recordPing: builder.mutation<PingDto, RecordPingPayload>({
      query: (body) => ({ url: 'ping', method: 'POST', body }),
      invalidatesTags: ['Ping'],
    }),
  }),
});

export const { useListPingsQuery, useRecordPingMutation } = pingApi;
