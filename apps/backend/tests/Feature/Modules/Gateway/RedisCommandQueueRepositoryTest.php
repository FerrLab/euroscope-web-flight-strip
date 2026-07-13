<?php

declare(strict_types=1);

use App\Modules\Gateway\Domain\CommandQueueRepository;
use App\Modules\Gateway\Infrastructure\RedisCommandQueueRepository;
use Tests\Support\Modules\Gateway\GatewayRedisTestSupport;

beforeEach(fn () => GatewayRedisTestSupport::useIsolatedPrefix());
afterEach(fn () => GatewayRedisTestSupport::flush());

it('binds the interface in the container (happy)', function (): void {
    expect(app(CommandQueueRepository::class))->toBeInstanceOf(RedisCommandQueueRepository::class);
});

it('drains queued commands in order and empties the queue (happy)', function (): void {
    $repo = new RedisCommandQueueRepository;
    $repo->enqueue(7, '{"n":1}');
    $repo->enqueue(7, '{"n":2}');
    $repo->enqueue(7, '{"n":3}');

    expect($repo->drain(7, 1))->toBe(['{"n":1}', '{"n":2}', '{"n":3}']);
    expect($repo->drain(7, 1))->toBe([]);
});

it('returns empty after the block timeout on an empty queue (invalid)', function (): void {
    $repo = new RedisCommandQueueRepository;

    $start = microtime(true);
    expect($repo->drain(9, 1))->toBe([]);
    expect(microtime(true) - $start)->toBeGreaterThan(0.9);
});

it('does not leak commands across users (garbage)', function (): void {
    $repo = new RedisCommandQueueRepository;
    $repo->enqueue(1, '{"mine":true}');

    expect($repo->drain(2, 1))->toBe([]);
    expect($repo->drain(1, 1))->toBe(['{"mine":true}']);
});
