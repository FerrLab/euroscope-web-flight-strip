import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// All requests go through the Next.js proxy at /api/proxy/* (Decision #6).
// Browser JS never sees the Bearer token; the cookie is forwarded by Next.js.
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/proxy/api',
    credentials: 'include',
  }),
  endpoints: () => ({}),
  tagTypes: ['Ping'],
});
