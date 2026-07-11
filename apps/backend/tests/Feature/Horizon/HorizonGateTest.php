<?php

declare(strict_types=1);

use App\Authorization\Roles\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role as RoleModel;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    RoleModel::firstOrCreate(['name' => Role::Admin->value, 'guard_name' => 'web']);
    RoleModel::firstOrCreate(['name' => Role::Member->value, 'guard_name' => 'web']);
});

it('forbids unauthenticated access to /horizon (happy)', function (): void {
    // Horizon's Authenticate middleware throws ForbiddenException when the
    // viewHorizon gate fails. Without an authenticated user our gate returns
    // false, so the response is 403 rather than a redirect to login.
    $this->get('/horizon')->assertForbidden();
});

it('forbids a member-role user (invalid)', function (): void {
    $member = User::factory()->create();
    $member->assignRole(Role::Member->value);

    $this->actingAs($member)->get('/horizon')->assertForbidden();
});

it('allows an admin-role user (happy)', function (): void {
    $admin = User::factory()->create();
    $admin->assignRole(Role::Admin->value);

    $response = $this->actingAs($admin)->get('/horizon');
    expect($response->status())->toBeIn([200, 302]); // Horizon UI returns 200 in dev
});
