import { baseApi as api } from './baseApi';
export const addTagTypes = ['Console', 'Ping', 'PluginTransport', 'Token'] as const;
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
      postGatewayCommands: build.mutation<
        PostGatewayCommandsApiResponse,
        PostGatewayCommandsApiArg
      >({
        query: (queryArg) => ({
          url: `/gateway/commands`,
          method: 'POST',
          body: queryArg.enqueuePluginCommandRequest,
        }),
        invalidatesTags: ['Console'],
      }),
      getGatewayConsolePoll: build.query<
        GetGatewayConsolePollApiResponse,
        GetGatewayConsolePollApiArg
      >({
        query: (queryArg) => ({
          url: `/gateway/console/poll`,
          params: {
            after: queryArg.after,
          },
        }),
        providesTags: ['Console'],
      }),
      getPing: build.query<GetPingApiResponse, GetPingApiArg>({
        query: () => ({ url: `/ping` }),
        providesTags: ['Ping'],
      }),
      postPing: build.mutation<PostPingApiResponse, PostPingApiArg>({
        query: (queryArg) => ({ url: `/ping`, method: 'POST', body: queryArg.recordPingRequest }),
        invalidatesTags: ['Ping'],
      }),
      postEuroscopeMessages: build.mutation<
        PostEuroscopeMessagesApiResponse,
        PostEuroscopeMessagesApiArg
      >({
        query: (queryArg) => ({
          url: `/euroscope/messages`,
          method: 'POST',
          body: queryArg.recordPluginMessagesRequest,
        }),
        invalidatesTags: ['PluginTransport'],
      }),
      getEuroscopePoll: build.query<GetEuroscopePollApiResponse, GetEuroscopePollApiArg>({
        query: () => ({ url: `/euroscope/poll` }),
        providesTags: ['PluginTransport'],
      }),
      postGatewayToken: build.mutation<PostGatewayTokenApiResponse, PostGatewayTokenApiArg>({
        query: () => ({ url: `/gateway/token`, method: 'POST' }),
        invalidatesTags: ['Token'],
      }),
      getGatewayToken: build.query<GetGatewayTokenApiResponse, GetGatewayTokenApiArg>({
        query: () => ({ url: `/gateway/token` }),
        providesTags: ['Token'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as eurostripApi };
export type GetUserApiResponse = /** status 200 `User` */ User;
export type GetUserApiArg = void;
export type PostGatewayCommandsApiResponse = /** status 200  */ 202;
export type PostGatewayCommandsApiArg = {
  enqueuePluginCommandRequest: EnqueuePluginCommandRequest;
};
export type GetGatewayConsolePollApiResponse = /** status 200  */ 200;
export type GetGatewayConsolePollApiArg = {
  after?: string;
};
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
export type PostEuroscopeMessagesApiResponse = /** status 200  */ 204;
export type PostEuroscopeMessagesApiArg = {
  recordPluginMessagesRequest: RecordPluginMessagesRequest;
};
export type GetEuroscopePollApiResponse = /** status 200  */ 200;
export type GetEuroscopePollApiArg = void;
export type PostGatewayTokenApiResponse = /** status 200  */ 201;
export type PostGatewayTokenApiArg = void;
export type GetGatewayTokenApiResponse = /** status 200  */ 200;
export type GetGatewayTokenApiArg = void;
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
export type EnqueuePluginCommandRequest = {
  action: string;
  callsign?: string | null;
  payload?: string[] | null;
  id?: string | null;
};
export type RecordPingRequest = {
  note: string[];
};
export type RecordPluginMessagesRequest = {
  messages: string[];
};
export const {
  useGetUserQuery,
  usePostGatewayCommandsMutation,
  useGetGatewayConsolePollQuery,
  useGetPingQuery,
  usePostPingMutation,
  usePostEuroscopeMessagesMutation,
  useGetEuroscopePollQuery,
  usePostGatewayTokenMutation,
  useGetGatewayTokenQuery,
} = injectedRtkApi;
