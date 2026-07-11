<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Passport\ClientRepository;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    // RefreshDatabase truncates oauth_clients between tests, so we seed a
    // fresh personal-access client per test rather than relying on the
    // entrypoint-provisioned production client.
    app(ClientRepository::class)->createPersonalAccessGrantClient(
        name: 'Test Personal Access Client',
        provider: 'users',
    );
});

it('mints a personal-access token for a user', function (): void {
    $user = User::factory()->create();

    $token = $user->createToken('smoke')->accessToken;

    expect($token)->toBeString()->and(strlen($token))->toBeGreaterThan(40);
});
