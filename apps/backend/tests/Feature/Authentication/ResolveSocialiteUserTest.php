<?php

declare(strict_types=1);

use App\Authentication\ResolveSocialiteUser;
use App\Authorization\Roles\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role as RoleModel;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    RoleModel::firstOrCreate(['name' => Role::Member->value, 'guard_name' => 'web']);
});

it('creates a new user with the given CID and assigns member (happy)', function (): void {
    $user = app(ResolveSocialiteUser::class)->resolve('1234567', 'alice@vatsim.local', 'Alice');

    expect($user->vatsim_cid)->toBe('1234567');
    expect($user->email)->toBe('alice@vatsim.local');
    expect($user->hasRole(Role::Member->value))->toBeTrue();
    $this->assertDatabaseCount('users', 1);
});

it('matches an existing user by CID on repeat login without duplicating (happy)', function (): void {
    $first = app(ResolveSocialiteUser::class)->resolve('1234567', 'alice@vatsim.local', 'Alice');
    $second = app(ResolveSocialiteUser::class)->resolve('1234567', 'alice@vatsim.local', 'Alice');

    expect($second->id)->toBe($first->id);
    $this->assertDatabaseCount('users', 1);
});

it('adopts an existing row by email when no CID matches yet (happy — links a pre-existing account)', function (): void {
    $existing = User::factory()->create(['email' => 'bob@vatsim.local', 'vatsim_cid' => null]);

    $resolved = app(ResolveSocialiteUser::class)->resolve('7654321', 'bob@vatsim.local', 'Bob');

    expect($resolved->id)->toBe($existing->id);
    expect($resolved->fresh()?->vatsim_cid)->toBe('7654321');
    $this->assertDatabaseCount('users', 1);
});

it('does not re-assign member if the user already has it (invalid — no duplicate pivot row)', function (): void {
    $user = app(ResolveSocialiteUser::class)->resolve('1234567', 'alice@vatsim.local', 'Alice');
    app(ResolveSocialiteUser::class)->resolve('1234567', 'alice@vatsim.local', 'Alice');

    expect($user->fresh()?->roles()->count())->toBe(1);
});

it('creates a user with no CID when none is supplied — the stub path (garbage — cid absent by design)', function (): void {
    $user = app(ResolveSocialiteUser::class)->resolve(null, 'stub-user@eurostrip.local', 'stub-user');

    expect($user->vatsim_cid)->toBeNull();
    expect($user->hasRole(Role::Member->value))->toBeTrue();
});
