<?php

declare(strict_types=1);

use App\Authorization\Roles\Role;
use App\Models\User;
use App\Modules\Ping\Domain\PingPermission;
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

    (new PermissionsSeeder([PingPermission::class]))->run();

    RoleModel::firstOrCreate(['name' => Role::Member->value, 'guard_name' => 'web'])
        ->givePermissionTo(
            Permission::findByName(PingPermission::View->value),
            Permission::findByName(PingPermission::Create->value),
        );
});

it('flows: stub login → mint token → POST /api/ping → GET /api/ping (happy)', function (): void {
    // 1. Stub login mints a Passport token
    $login = $this->getJson('/auth/socialite/stub/callback?identity=member@local')->json();
    expect($login['access_token'])->toBeString();

    $user = User::query()->where('email', 'member@local')->firstOrFail();
    $user->assignRole(Role::Member->value);

    $token = $login['access_token'];

    // 2. POST a ping
    $created = $this->withToken($token)
        ->postJson('/api/ping', ['note' => ['en' => 'flow', 'pt' => 'fluxo']])
        ->assertCreated()
        ->json();

    // 3. GET pings — the new one shows up
    $list = $this->withToken($token)->getJson('/api/ping')->assertOk()->json();

    expect($list)->toHaveCount(1);
    expect($list[0]['id'])->toBe($created['id']);
    expect($list[0]['note']['en'])->toBe('flow');
});
