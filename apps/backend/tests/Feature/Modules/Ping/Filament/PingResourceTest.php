<?php

declare(strict_types=1);

use App\Authorization\Roles\Role;
use App\Models\User;
use App\Modules\Ping\Domain\PingPermission;
use App\Modules\Ping\Infrastructure\PingModel;
use Database\Seeders\PermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role as RoleModel;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    (new PermissionsSeeder([PingPermission::class]))->run();
    RoleModel::firstOrCreate(['name' => Role::Admin->value, 'guard_name' => 'web'])
        ->givePermissionTo(Permission::all());
});

it('renders the Ping list page for an admin (happy)', function (): void {
    $admin = User::factory()->create();
    $admin->assignRole(Role::Admin->value);
    PingModel::factory()->count(2)->create(['user_id' => $admin->id]);

    $this->actingAs($admin)
        ->get('/admin/pings')
        ->assertSuccessful();
});
