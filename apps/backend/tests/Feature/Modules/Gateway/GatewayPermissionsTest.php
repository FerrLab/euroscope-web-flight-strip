<?php

declare(strict_types=1);

use App\Authorization\Roles\Role;
use App\Modules\Gateway\Domain\GatewayPermission;
use Database\Seeders\PermissionsSeeder;
use Database\Seeders\RolesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role as RoleModel;

uses(RefreshDatabase::class);

it('declares the three gateway permissions (happy)', function (): void {
    expect(GatewayPermission::UseGateway->value)->toBe('gateway.use');
    expect(GatewayPermission::UseConsole->value)->toBe('gateway.console');
    expect(GatewayPermission::ManageToken->value)->toBe('gateway.token');
});

it('is discovered by the permissions seeder (happy)', function (): void {
    (new PermissionsSeeder)->run();

    foreach (GatewayPermission::cases() as $case) {
        $this->assertDatabaseHas('permissions', [
            'name' => $case->value,
            'guard_name' => 'web',
        ]);
    }
});

it('grants all gateway permissions to the member role (happy)', function (): void {
    (new PermissionsSeeder)->run();
    (new RolesSeeder)->run();

    $member = RoleModel::where('name', Role::Member->value)
        ->where('guard_name', 'web')
        ->firstOrFail();

    foreach (GatewayPermission::cases() as $case) {
        expect($member->hasPermissionTo($case->value))->toBeTrue();
    }
});
