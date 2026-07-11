<?php

declare(strict_types=1);

use App\Authorization\Roles\Role;
use App\Models\User;
use App\Modules\Gateway\Domain\GatewayPermission;
use Database\Seeders\PermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Passport\ClientRepository;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role as RoleModel;

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
});

/**
 * @return array{0: User, 1: string}
 */
function tokenAuthenticatedAs(string $tokenName = 'stub-login'): array
{
    $user = User::factory()->create();
    $user->assignRole(Role::Member->value);
    $token = $user->createToken($tokenName)->accessToken;

    return [$user, $token];
}

it('reports no token before creation (happy empty)', function (): void {
    [, $token] = tokenAuthenticatedAs();

    $this->withToken($token)->getJson('/api/gateway/token')
        ->assertOk()
        ->assertJson(['exists' => false, 'created_at' => null]);
});

it('creates a gateway token and returns the secret once (happy)', function (): void {
    [$user, $token] = tokenAuthenticatedAs();

    $response = $this->withToken($token)->postJson('/api/gateway/token');

    $response->assertStatus(201);
    expect($response->json('token'))->toBeString();
    expect($response->json('token'))->not->toBe('');
    expect($response->json('created_at'))->not->toBeNull();
    expect($user->tokens()->where('name', 'gateway')->where('revoked', false)->count())->toBe(1);

    $this->withToken($token)->getJson('/api/gateway/token')
        ->assertOk()
        ->assertJsonPath('exists', true);
});

it('revokes the previous token on rotate (happy)', function (): void {
    [$user, $token] = tokenAuthenticatedAs();

    $first = $this->withToken($token)->postJson('/api/gateway/token')->json('token');
    $second = $this->withToken($token)->postJson('/api/gateway/token')->json('token');

    expect($second)->not->toBe($first);
    expect($user->tokens()->where('name', 'gateway')->where('revoked', false)->count())->toBe(1);

    // The revoked secret no longer authenticates on plugin routes.
    $this->withToken($first)->getJson('/api/euroscope/poll?timeout=1')->assertStatus(401);
});

it('rejects the gateway token itself on token routes (invalid token name)', function (): void {
    [, $webToken] = tokenAuthenticatedAs();
    $gatewaySecret = $this->withToken($webToken)->postJson('/api/gateway/token')->json('token');

    $this->withToken($gatewaySecret)->getJson('/api/gateway/token')->assertForbidden();
    $this->withToken($gatewaySecret)->postJson('/api/gateway/token')->assertForbidden();
});

it('rejects unauthenticated token requests (garbage)', function (): void {
    $this->getJson('/api/gateway/token')->assertStatus(401);
    $this->postJson('/api/gateway/token')->assertStatus(401);
});
