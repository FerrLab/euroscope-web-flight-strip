<?php

declare(strict_types=1);

use App\Authorization\Roles\Role;
use App\Models\User;
use App\Modules\Gateway\Domain\CommandQueueRepository;
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
function gatewayAuthenticatedAs(string $tokenName = 'gateway'): array
{
    $user = User::factory()->create();
    $user->assignRole(Role::Member->value);
    $token = $user->createToken($tokenName)->accessToken;

    return [$user, $token];
}

it('ingests a batch and stores each envelope inbound (happy)', function (): void {
    [$user, $token] = gatewayAuthenticatedAs();

    $response = $this->withToken($token)->postJson('/api/euroscope/messages', [
        'messages' => [
            ['type' => 'event', 'callsign' => 'DLH4TX', 'action' => 'flight_updated', 'payload' => ['origin' => 'EDDM']],
            ['type' => 'response', 'id' => 7, 'action' => 'ping', 'ok' => true],
        ],
    ]);

    $response->assertNoContent();

    $batch = app(GatewayStreamRepository::class)->tail($user->id, null, 0);
    expect($batch->messages)->toHaveCount(2);
    expect($batch->messages[0]['direction'])->toBe('in');
    expect(json_decode($batch->messages[0]['envelope'], true)['action'])->toBe('flight_updated');
});

it('drops garbage entries but keeps the good ones (invalid entries)', function (): void {
    [$user, $token] = gatewayAuthenticatedAs();

    $this->withToken($token)->postJson('/api/euroscope/messages', [
        'messages' => [
            ['type' => 'event', 'action' => 'flight_removed', 'callsign' => 'ABC1234'],
            'garbage-string',
            [1, 2, 3],
        ],
    ])->assertNoContent();

    expect(app(GatewayStreamRepository::class)->tail($user->id, null, 0)->messages)->toHaveCount(1);
});

it('rejects a batch of more than 200 messages (invalid)', function (): void {
    [, $token] = gatewayAuthenticatedAs();

    $messages = array_fill(0, 201, ['type' => 'event', 'action' => 'x']);

    $this->withToken($token)
        ->postJson('/api/euroscope/messages', ['messages' => $messages])
        ->assertStatus(422);
});

it('accepts a large session-scan batch under 5 MB (happy — busy session)', function (): void {
    // A list_flights response for a busy session is one big envelope;
    // 512 KB proved too small in the field (GRU evening traffic).
    [$user, $token] = gatewayAuthenticatedAs();

    $messages = [['type' => 'response', 'action' => 'list_flights', 'ok' => true, 'payload' => ['blob' => str_repeat('a', 600_000)]]];

    $this->withToken($token)
        ->postJson('/api/euroscope/messages', ['messages' => $messages])
        ->assertNoContent();

    expect(app(GatewayStreamRepository::class)->tail($user->id, null, 0)->messages)->toHaveCount(1);
});

it('rejects a batch body over 5 MB (garbage volume)', function (): void {
    [, $token] = gatewayAuthenticatedAs();

    $messages = [['type' => 'event', 'action' => 'x', 'payload' => ['blob' => str_repeat('a', 5_300_000)]]];

    $this->withToken($token)
        ->postJson('/api/euroscope/messages', ['messages' => $messages])
        ->assertStatus(413);
});

it('rejects a body without messages (invalid)', function (): void {
    [, $token] = gatewayAuthenticatedAs();

    $this->withToken($token)->postJson('/api/euroscope/messages', [])->assertStatus(422);
});

it('drains queued commands on poll (happy)', function (): void {
    [$user, $token] = gatewayAuthenticatedAs();
    app(CommandQueueRepository::class)->enqueue($user->id, '{"type":"command","id":"x","action":"ping"}');

    $response = $this->withToken($token)->getJson('/api/euroscope/poll?timeout=1');

    $response->assertOk();
    $response->assertJsonCount(1, 'commands');
    $response->assertJsonPath('commands.0.action', 'ping');
});

it('returns 204 when the queue stays empty for the hold (happy timeout)', function (): void {
    [, $token] = gatewayAuthenticatedAs();

    $this->withToken($token)->getJson('/api/euroscope/poll?timeout=1')->assertNoContent();
});

it('marks plugin presence on poll (happy)', function (): void {
    [$user, $token] = gatewayAuthenticatedAs();

    $this->withToken($token)->getJson('/api/euroscope/poll?timeout=1');

    expect(app(PluginPresenceRepository::class)->isConnected($user->id))->toBeTrue();
});

it('rejects a web-session token on plugin routes (invalid token name)', function (): void {
    [, $token] = gatewayAuthenticatedAs('stub-login');

    $this->withToken($token)
        ->postJson('/api/euroscope/messages', ['messages' => [['a' => 1]]])
        ->assertForbidden();
    $this->withToken($token)->getJson('/api/euroscope/poll?timeout=1')->assertForbidden();
});

it('rejects unauthenticated plugin requests (garbage)', function (): void {
    $this->postJson('/api/euroscope/messages', ['messages' => [['a' => 1]]])->assertStatus(401);
    $this->getJson('/api/euroscope/poll')->assertStatus(401);
});
