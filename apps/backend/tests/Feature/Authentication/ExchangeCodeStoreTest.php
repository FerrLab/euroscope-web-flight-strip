<?php

declare(strict_types=1);

use App\Authentication\ExchangeCodeStore;
use Illuminate\Support\Facades\Redis;
use Tests\Support\Authentication\SocialiteExchangeRedisTestSupport;

beforeEach(function (): void {
    SocialiteExchangeRedisTestSupport::useIsolatedPrefix();
});

afterEach(function (): void {
    SocialiteExchangeRedisTestSupport::flush();
});

it('redeems a stored token exactly once (happy)', function (): void {
    $store = app(ExchangeCodeStore::class);

    $code = $store->put('bearer-token-abc', 60);
    expect($code)->toBeString()->not->toBe('');

    expect($store->redeem($code))->toBe('bearer-token-abc');
});

it('sets a TTL close to the requested window (happy)', function (): void {
    $store = app(ExchangeCodeStore::class);
    $code = $store->put('tok', 60);

    $key = config('socialite.exchange.key_prefix').':'.$code;
    $ttl = Redis::connection()->ttl($key);

    expect($ttl)->toBeGreaterThan(0)->toBeLessThanOrEqual(60);
});

it('returns null on a replayed code (invalid)', function (): void {
    $store = app(ExchangeCodeStore::class);
    $code = $store->put('tok', 60);

    $store->redeem($code);

    expect($store->redeem($code))->toBeNull();
});

it('returns null for an unknown code (garbage)', function (): void {
    $store = app(ExchangeCodeStore::class);

    expect($store->redeem('this-code-was-never-issued'))->toBeNull();
});

it('returns null for an empty code (garbage)', function (): void {
    $store = app(ExchangeCodeStore::class);

    expect($store->redeem(''))->toBeNull();
});
