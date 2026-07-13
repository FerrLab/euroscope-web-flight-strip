<?php

declare(strict_types=1);

use App\Authorization\Roles\Role;
use App\Models\User;
use App\Modules\Gateway\Domain\CommandQueueRepository;
use App\Modules\Gateway\Domain\Direction;
use App\Modules\Gateway\Domain\GatewayPermission;
use App\Modules\Gateway\Domain\GatewayStreamRepository;
use App\Modules\Gateway\Domain\PluginPresenceRepository;
use Database\Seeders\PermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Passport\ClientRepository;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role as RoleModel;
use Tests\Support\Modules\Gateway\GatewayRedisTestSupport;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    app(ClientRepository::class)->createPersonalAccessGrantClient(
        name: 'Test Personal Access Client',
        provider: 'users',
    );

    (new PermissionsSeeder([GatewayPermission::class]))->run();

    RoleModel::firstOrCreate(['name' => Role::Member->value, 'guard_name' => 'web'])
        ->givePermissionTo(
            Permission::findByName(GatewayPermission::UseGateway->value),
            Permission::findByName(GatewayPermission::UseConsole->value),
            Permission::findByName(GatewayPermission::ManageToken->value),
        );

    GatewayRedisTestSupport::useIsolatedPrefix();
});

afterEach(fn () => GatewayRedisTestSupport::flush());

/**
 * @return array{0: User, 1: string}
 */
function consoleAuthenticatedAs(string $tokenName = 'stub-login'): array
{
    $user = User::factory()->create();
    $user->assignRole(Role::Member->value);
    $token = $user->createToken($tokenName)->accessToken;

    return [$user, $token];
}

it('queues a command and mirrors it into the feed (happy)', function (): void {
    [$user, $token] = consoleAuthenticatedAs();

    $response = $this->withToken($token)->postJson('/api/gateway/commands', [
        'action' => 'set_squawk',
        'callsign' => 'ABC1234',
        'payload' => ['code' => '2354'],
    ]);

    $response->assertStatus(202);
    $response->assertJsonPath('queued.type', 'command');
    $response->assertJsonPath('queued.action', 'set_squawk');
    expect($response->json('queued.id'))->not->toBeEmpty();

    expect(app(CommandQueueRepository::class)->drain($user->id, 1))->toHaveCount(1);
    $batch = app(GatewayStreamRepository::class)->tail($user->id, null, 0);
    expect($batch->messages)->toHaveCount(1);
    expect($batch->messages[0]['direction'])->toBe('out');
});

it('rejects a command without an action (invalid)', function (): void {
    [, $token] = consoleAuthenticatedAs();

    $this->withToken($token)->postJson('/api/gateway/commands', [
        'callsign' => 'ABC1234',
    ])->assertStatus(422);
});

it('rejects a garbage action type (garbage)', function (): void {
    [, $token] = consoleAuthenticatedAs();

    $this->withToken($token)->postJson('/api/gateway/commands', [
        'action' => ['not' => 'a-string'],
    ])->assertStatus(422);
});

it('rate limits sends at 60 per minute (invalid volume)', function (): void {
    [, $token] = consoleAuthenticatedAs();

    for ($i = 0; $i < 60; $i++) {
        $this->withToken($token)
            ->postJson('/api/gateway/commands', ['action' => 'ping'])
            ->assertStatus(202);
    }

    $this->withToken($token)
        ->postJson('/api/gateway/commands', ['action' => 'ping'])
        ->assertStatus(429);
});

it('backfills the console without a cursor (happy)', function (): void {
    [$user, $token] = consoleAuthenticatedAs();
    app(GatewayStreamRepository::class)->append($user->id, Direction::In, '{"type":"event","action":"flight_updated"}');

    $response = $this->withToken($token)->getJson('/api/gateway/console/poll?timeout=0');

    $response->assertOk();
    $response->assertJsonCount(1, 'messages');
    $response->assertJsonPath('messages.0.direction', 'in');
    $response->assertJsonPath('messages.0.envelope.action', 'flight_updated');
    $response->assertJsonPath('reset', false);
    expect($response->json('cursor'))->toBe($response->json('messages.0.id'));
});

it('tails only after the cursor and reports presence (happy)', function (): void {
    [$user, $token] = consoleAuthenticatedAs();
    $stream = app(GatewayStreamRepository::class);
    $firstId = $stream->append($user->id, Direction::In, '{"n":1}');
    $stream->append($user->id, Direction::In, '{"n":2}');
    app(PluginPresenceRepository::class)->markSeen($user->id);

    $response = $this->withToken($token)->getJson('/api/gateway/console/poll?after='.$firstId.'&timeout=0');

    $response->assertOk();
    $response->assertJsonCount(1, 'messages');
    $response->assertJsonPath('messages.0.envelope.n', 2);
    $response->assertJsonPath('pluginConnected', true);
});

it('flags reset when the cursor was trimmed away (invalid cursor)', function (): void {
    [$user, $token] = consoleAuthenticatedAs();
    $stream = app(GatewayStreamRepository::class);
    for ($i = 0; $i <= 210; $i++) {
        $stream->append($user->id, Direction::In, sprintf('{"i":%d}', $i));
    }

    $response = $this->withToken($token)->getJson('/api/gateway/console/poll?after=1-1&timeout=0');

    $response->assertOk();
    $response->assertJsonPath('reset', true);
    $response->assertJsonCount(200, 'messages');
});

it('rejects a malformed cursor (garbage)', function (): void {
    [, $token] = consoleAuthenticatedAs();

    $this->withToken($token)
        ->getJson('/api/gateway/console/poll?after=;DROP&timeout=0')
        ->assertStatus(422);
});

it('rejects the gateway token on console routes (invalid token name)', function (): void {
    [, $token] = consoleAuthenticatedAs('gateway');

    $this->withToken($token)->postJson('/api/gateway/commands', ['action' => 'ping'])->assertForbidden();
    $this->withToken($token)->getJson('/api/gateway/console/poll?timeout=0')->assertForbidden();
});

it('rejects unauthenticated console requests (garbage)', function (): void {
    $this->postJson('/api/gateway/commands', ['action' => 'ping'])->assertStatus(401);
    $this->getJson('/api/gateway/console/poll')->assertStatus(401);
});
