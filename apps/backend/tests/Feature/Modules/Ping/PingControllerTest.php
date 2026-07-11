<?php

declare(strict_types=1);

use App\Authorization\Roles\Role;
use App\Models\User;
use App\Modules\Ping\Domain\PingPermission;
use App\Modules\Ping\Infrastructure\PingModel;
use Database\Seeders\PermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Passport\ClientRepository;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role as RoleModel;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    // RefreshDatabase truncates oauth_clients between tests, so we seed a
    // fresh personal-access client per test.
    app(ClientRepository::class)->createPersonalAccessGrantClient(
        name: 'Test Personal Access Client',
        provider: 'users',
    );

    (new PermissionsSeeder([
        PingPermission::class,
    ]))->run();

    RoleModel::firstOrCreate(['name' => Role::Member->value, 'guard_name' => 'web'])
        ->givePermissionTo(
            Permission::findByName(PingPermission::View->value),
            Permission::findByName(PingPermission::Create->value),
        );
});

/**
 * @return array{0: User, 1: string}
 */
function authenticatedAs(): array
{
    $user = User::factory()->create();
    $user->assignRole(Role::Member->value);
    $token = $user->createToken('test')->accessToken;

    return [$user, $token];
}

it('records a ping with a valid payload (happy)', function (): void {
    [$user, $token] = authenticatedAs();

    $response = $this
        ->withToken($token)
        ->postJson('/api/ping', ['note' => ['en' => 'hello', 'pt' => 'olá']]);

    $response->assertCreated();
    $response->assertJsonStructure(['id', 'note' => ['en', 'pt'], 'created_at']);

    expect(PingModel::count())->toBe(1);
});

it('rejects an empty body (invalid)', function (): void {
    [$user, $token] = authenticatedAs();

    $this->withToken($token)
        ->postJson('/api/ping', [])
        ->assertStatus(422);
});

it('rejects garbage payloads (garbage)', function (): void {
    [$user, $token] = authenticatedAs();

    $this->withToken($token)
        ->postJson('/api/ping', ['note' => 'not-an-array'])
        ->assertStatus(422);
});

it('lists pings for the authenticated user (happy)', function (): void {
    [$user, $token] = authenticatedAs();
    PingModel::factory()->count(2)->create(['user_id' => $user->id]);

    $response = $this->withToken($token)->getJson('/api/ping');

    $response->assertOk();
    expect($response->json())->toHaveCount(2);
});

it('rejects unauthenticated requests (invalid)', function (): void {
    $this->getJson('/api/ping')->assertStatus(401);
});
