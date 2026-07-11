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

it('redirects unauthenticated /admin to login (happy)', function (): void {
    $response = $this->get('/admin');
    expect($response->status())->toBeIn([302, 403]);
});

it('forbids a member-role user from /admin (invalid)', function (): void {
    $member = User::factory()->create();
    $member->assignRole(Role::Member->value);

    $response = $this->actingAs($member)->get('/admin');
    expect($response->status())->toBeIn([302, 403]);
});

it('allows an admin-role user to /admin (happy)', function (): void {
    $admin = User::factory()->create();
    $admin->assignRole(Role::Admin->value);

    $response = $this->actingAs($admin)->get('/admin');
    expect($response->status())->toBeIn([200, 302]);
});
