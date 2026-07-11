import type { ConfigFile } from '@rtk-query/codegen-openapi';

const config: ConfigFile = {
  schemaFile: '../../apps/backend/openapi.json',
  apiFile: './src/baseApi.ts',
  apiImport: 'baseApi',
  outputFile: './src/generated.ts',
  exportName: 'azimuthApi',
  hooks: true,
  tag: true,
};

export default config;
