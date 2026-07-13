<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Modules\Gateway\Domain\GatewayPermission;
use App\Modules\Ping\Domain\PingPermission;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission as PermissionModel;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Idempotent seeder for the baseline application roles. Runs on every
 * container boot via the entrypoint script, so every operation must be
 * safe to repeat (firstOrCreate + Spatie's syncPermissions).
 *
 * Per-module permissions are listed explicitly here — DO NOT use
 * Permission::all() as the grant set, since adding a new admin-only
 * permission in a future module would silently widen the member role.
 */
class RolesSeeder extends Seeder
{
    public function run(): void
    {
        $member = Role::firstOrCreate(['name' => 'member', 'guard_name' => 'web']);

        $memberPermissionNames = [
            PingPermission::View->value,
            PingPermission::Create->value,
            GatewayPermission::UseGateway->value,
            GatewayPermission::UseConsole->value,
            GatewayPermission::ManageToken->value,
        ];

        $memberPermissions = PermissionModel::whereIn('name', $memberPermissionNames)
            ->where('guard_name', 'web')
            ->get();

        $member->syncPermissions($memberPermissions);

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
}
