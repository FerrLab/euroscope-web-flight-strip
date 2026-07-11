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

it('mints a Passport token for the default stub identity (happy)', function (): void {
    $response = $this->get('/auth/socialite/stub/callback');

    $response->assertStatus(200);
    $response->assertJsonStructure(['access_token', 'token_type', 'user' => ['id', 'email']]);
    expect($response->json('user.email'))->toBe('stub-user@azimuth.local');
    expect($response->json('access_token'))->toBeString();

    $this->assertDatabaseHas('users', ['email' => 'stub-user@azimuth.local']);
});

it('honors ?identity=<email> for fixture identities (happy)', function (): void {
    $response = $this->get('/auth/socialite/stub/callback?identity=alice@local');

    $response->assertStatus(200);
    expect($response->json('user.email'))->toBe('alice@local');

    $this->assertDatabaseHas('users', ['email' => 'alice@local']);
});

it('mints valid tokens that authenticate against api guard (happy)', function (): void {
    $login = $this->getJson('/auth/socialite/stub/callback')->json();

    $userId = User::query()->where('email', 'stub-user@azimuth.local')->value('id');

    $auth = $this
        ->withToken($login['access_token'])
        ->getJson('/api/user');

    $auth->assertStatus(200);
    expect($auth->json('id'))->toBe($userId);
});
