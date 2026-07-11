<?php

declare(strict_types=1);

use App\Modules\Gateway\Domain\PluginPresenceRepository;
use App\Modules\Gateway\Infrastructure\RedisPluginPresenceRepository;
use Illuminate\Support\Facades\Redis;
use Tests\Support\Modules\Gateway\GatewayRedisTestSupport;

beforeEach(fn () => GatewayRedisTestSupport::useIsolatedPrefix());
afterEach(fn () => GatewayRedisTestSupport::flush());

it('binds the interface in the container (happy)', function (): void {
    expect(app(PluginPresenceRepository::class))->toBeInstanceOf(RedisPluginPresenceRepository::class);
});

it('reports connected after markSeen with a 35s TTL (happy)', function (): void {
    $repo = new RedisPluginPresenceRepository;
    $repo->markSeen(7);

    expect($repo->isConnected(7))->toBeTrue();

    $ttl = (int) Redis::connection()->ttl(config('gateway.key_prefix').':7:plugin-seen');
    expect($ttl)->toBeGreaterThan(0)->toBeLessThanOrEqual(35);
});

it('reports disconnected when never seen (invalid)', function (): void {
    expect((new RedisPluginPresenceRepository)->isConnected(404))->toBeFalse();
});
