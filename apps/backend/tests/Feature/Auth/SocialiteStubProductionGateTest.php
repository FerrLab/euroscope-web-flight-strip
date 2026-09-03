<?php

declare(strict_types=1);

use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Passport\ClientRepository;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    app(ClientRepository::class)->createPersonalAccessGrantClient(
        name: 'Test Personal Access Client',
        provider: 'users',
    );
});

afterEach(function (): void {
    $this->app['env'] = 'testing';
});

it('404s the stub redirect in production (invalid)', function (): void {
    $this->app['env'] = 'production';

    $this->get('/auth/socialite/stub/redirect')->assertStatus(404);
});

it('404s the stub callback in production (invalid)', function (): void {
    $this->app['env'] = 'production';

    $this->get('/auth/socialite/stub/callback')->assertStatus(404);
});

it('serves the stub callback outside production (happy)', function (): void {
    $this->app['env'] = 'testing';

    $this->get('/auth/socialite/stub/callback')->assertOk();
});
