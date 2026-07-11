import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Seeds the Member role + ping permissions on the running backend so fresh
 * stub identities can authorize Ping endpoints during E2E.
 *
 * Quoting Tinker's --execute on Windows is unreliable, so we instead write
 * the PHP seed code to a temp file, copy it into the backend container, and
 * run it via `php artisan tinker` redirected from stdin.
 */
const PHP_SCRIPT = `
$seeder = new \\Database\\Seeders\\PermissionsSeeder([\\App\\Modules\\Ping\\Domain\\PingPermission::class]);
$seeder->run();
$role = \\Spatie\\Permission\\Models\\Role::firstOrCreate(['name' => 'member', 'guard_name' => 'web']);
$role->givePermissionTo(\\Spatie\\Permission\\Models\\Permission::all());
foreach (\\App\\Models\\User::all() as $u) { $u->syncRoles([$role]); }
echo 'e2e-setup-ok';
`;

export default async function globalSetup(): Promise<void> {
  // Project root is two directories up from apps/web/e2e.
  const projectRoot = join(__dirname, '..', '..', '..');

  const tmpDir = mkdtempSync(join(tmpdir(), 'eurostrip-e2e-'));
  const scriptPath = join(tmpDir, 'seed.php');
  writeFileSync(scriptPath, PHP_SCRIPT, 'utf8');

  // CI uses infra/docker-compose.ci.yml without `.env`; dev shell uses
  // infra/docker-compose.yml with `.env`. CI sets EUROSTRIP_COMPOSE_ARGS.
  const composeArgs = (
    process.env.EUROSTRIP_COMPOSE_ARGS ?? '--env-file .env -f infra/docker-compose.yml'
  ).split(/\s+/);

  try {
    // Pipe the PHP script into `php artisan tinker` running in the backend
    // container. Tinker reads from stdin when no --execute is provided.
    const out = execFileSync(
      'docker',
      ['compose', ...composeArgs, 'exec', '-T', 'backend', 'php', 'artisan', 'tinker'],
      {
        cwd: projectRoot,
        input: PHP_SCRIPT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'inherit'],
      },
    );

    if (!out.includes('e2e-setup-ok')) {
      console.error('[e2e global-setup] tinker output:\n', out);
      throw new Error('Permission seeding did not report success.');
    }

    console.log('[e2e global-setup] member role + ping permissions seeded.');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
