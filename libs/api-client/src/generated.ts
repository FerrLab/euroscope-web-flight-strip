import { baseApi as api } from './baseApi';
export const addTagTypes = ['Ping'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      getUser: build.query<GetUserApiResponse, GetUserApiArg>({
        query: () => ({ url: `/user` }),
        providesTags: [],
      }),
      getPing: build.query<GetPingApiResponse, GetPingApiArg>({
        query: () => ({ url: `/ping` }),
        providesTags: ['Ping'],
      }),
      postPing: build.mutation<PostPingApiResponse, PostPingApiArg>({
        query: (queryArg) => ({ url: `/ping`, method: 'POST', body: queryArg.recordPingRequest }),
        invalidatesTags: ['Ping'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as eurostripApi };
export type GetUserApiResponse = /** status 200 `User` */ User;
export type GetUserApiArg = void;
export type GetPingApiResponse = /** status 200  */ [
  {
    id: string;
    note: {
      [key: string]: string;
    };
    created_at: string;
  },
];
export type GetPingApiArg = void;
export type PostPingApiResponse = /** status 201  */ {
  id: string;
  note: string;
  created_at: string;
};
export type PostPingApiArg = {
  recordPingRequest: RecordPingRequest;
};
export type User = {
  id: number;
  name: string;
  email: string;
  email_verified_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  stripe_id: string | null;
  pm_type: string | null;
  pm_last_four: string | null;
  trial_ends_at: string | null;
};
export type RecordPingRequest = {
  note: string[];
};
export const { useGetUserQuery, useGetPingQuery, usePostPingMutation } = injectedRtkApi;
