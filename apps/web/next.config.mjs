import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  typedRoutes: true,
  // Pin the workspace root Next.js traces file dependencies from. Without
  // this, Next's automatic inference can walk past this repo entirely (e.g.
  // when checked out as a nested git worktree) and pull unrelated files
  // into the standalone build output.
  outputFileTracingRoot: path.join(__dirname, '../..'),
};

export default withNextIntl(nextConfig);
