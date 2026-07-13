#!/usr/bin/env node
/**
 * Asserts every Laravel API route (`api.php` group) is documented in the
 * OpenAPI snapshot at apps/backend/openapi.json. Runs in CI's docs-build job.
 *
 * Reads:
 *   - apps/backend/openapi.json (Scramble export, snapshot at build time)
 *   - php artisan route:list --json (live from running container)
 *
 * Excludes routes that are intentionally undocumented:
 *   - api/oauth/* (Passport-internal)
 *   - api/_debugbar/* (Laravel Debugbar dev-only)
 *   - HEAD shadows of GET routes (Laravel auto-registers them)
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const OPENAPI_PATH = 'apps/backend/openapi.json';
const EXCLUDED_PREFIXES = ['api/oauth/', 'api/_debugbar/'];

// CI uses infra/docker-compose.ci.yml without `.env`; dev shell uses
// infra/docker-compose.yml with `.env`. CI sets EUROSTRIP_COMPOSE_ARGS to
// override the default.
const COMPOSE_ARGS =
  process.env.EUROSTRIP_COMPOSE_ARGS ?? '--env-file .env -f infra/docker-compose.yml';

function getLaravelRoutes() {
  const out = execSync(
    `docker compose ${COMPOSE_ARGS} exec -T backend php artisan route:list --json`,
    { encoding: 'utf8' },
  );
  const all = JSON.parse(out);
  // Laravel emits `route:list --json` with combined method strings like
  // "GET|HEAD" or "GET|POST|HEAD". Split on `|` and drop HEAD shadows so each
  // (method, path) pair is checked independently against the OpenAPI spec.
  const expanded = [];
  for (const r of all) {
    if (!r.uri.startsWith('api/')) continue;
    if (EXCLUDED_PREFIXES.some((p) => r.uri.startsWith(p))) continue;
    const methods = r.method.split('|').filter((m) => m !== 'HEAD');
    for (const method of methods) {
      expanded.push({
        method: method.toLowerCase(),
        path: '/' + r.uri.replace(/^api\//, ''),
      });
    }
  }
  return expanded;
}

function getOpenApiOperations() {
  const spec = JSON.parse(readFileSync(OPENAPI_PATH, 'utf8'));
  const ops = [];
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const method of Object.keys(methods)) {
      if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
        ops.push({ method, path });
      }
    }
  }
  return ops;
}

function main() {
  const laravel = getLaravelRoutes();
  const openapi = getOpenApiOperations();
  const openapiSet = new Set(openapi.map((o) => `${o.method} ${o.path}`));

  const missing = laravel.filter((r) => !openapiSet.has(`${r.method} ${r.path}`));

  if (missing.length === 0) {
    console.log(`✓ Route coverage OK — ${laravel.length} routes, all documented in OpenAPI.`);
    process.exit(0);
  }

  console.error(`✗ Route coverage FAILED — ${missing.length} undocumented routes:`);
  for (const r of missing) {
    console.error(`  ${r.method.toUpperCase().padEnd(6)} /api${r.path}`);
  }
  console.error('');
  console.error('Fix: annotate the controller(s) with Scramble docblocks, then refresh the OpenAPI snapshot:');
  console.error('  pnpm nx run api-client:refresh');
  process.exit(1);
}

main();
