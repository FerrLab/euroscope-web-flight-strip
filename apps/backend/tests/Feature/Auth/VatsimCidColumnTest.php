<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;

uses(RefreshDatabase::class);

it('has a nullable vatsim_cid column (happy)', function (): void {
    expect(Schema::hasColumn('users', 'vatsim_cid'))->toBeTrue();

    $user = User::factory()->create(['vatsim_cid' => null]);
    expect($user->fresh()?->vatsim_cid)->toBeNull();
});

it('accepts a numeric CID string (happy)', function (): void {
    $user = User::factory()->create(['vatsim_cid' => '1234567']);
    expect($user->fresh()?->vatsim_cid)->toBe('1234567');
});

it('rejects a duplicate CID across two users (invalid)', function (): void {
    User::factory()->create(['vatsim_cid' => '1234567']);

    expect(fn () => User::factory()->create(['vatsim_cid' => '1234567']))
        ->toThrow(QueryException::class);
});

it('allows many users with a null CID — null is not unique-constrained (garbage)', function (): void {
    User::factory()->create(['vatsim_cid' => null]);
    User::factory()->create(['vatsim_cid' => null]);

    expect(User::query()->whereNull('vatsim_cid')->count())->toBe(2);
});
