<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Pennant\Feature;

uses(RefreshDatabase::class);

it('toggles a feature flag for a user', function (): void {
    Feature::define('smoke-flag', fn (User $user) => $user->id === 1);

    $u1 = User::factory()->create(['id' => 1]);
    $u2 = User::factory()->create(['id' => 2]);

    expect(Feature::for($u1)->active('smoke-flag'))->toBeTrue();
    expect(Feature::for($u2)->active('smoke-flag'))->toBeFalse();
});
