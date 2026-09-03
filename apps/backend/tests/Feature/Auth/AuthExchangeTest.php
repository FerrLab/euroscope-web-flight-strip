<?php

declare(strict_types=1);

use App\Authentication\ExchangeCodeStore;

it('redeems a valid code for its Bearer token (happy)', function (): void {
    $code = app(ExchangeCodeStore::class)->put('a-real-bearer-token', 60);

    $response = $this->postJson('/auth/socialite/exchange', ['code' => $code]);

    $response->assertOk();
    expect($response->json('access_token'))->toBe('a-real-bearer-token');
});

it('rejects a replayed code (invalid)', function (): void {
    $code = app(ExchangeCodeStore::class)->put('a-real-bearer-token', 60);
    $this->postJson('/auth/socialite/exchange', ['code' => $code]);

    $response = $this->postJson('/auth/socialite/exchange', ['code' => $code]);

    $response->assertStatus(422);
});

it('rejects an unknown code (garbage)', function (): void {
    $response = $this->postJson('/auth/socialite/exchange', ['code' => 'never-issued']);

    $response->assertStatus(422);
});

it('rejects a missing code (garbage)', function (): void {
    $response = $this->postJson('/auth/socialite/exchange', []);

    $response->assertStatus(422);
});
