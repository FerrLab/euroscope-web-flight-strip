<?php

declare(strict_types=1);

use App\Modules\Gateway\Domain\Direction;
use App\Modules\Gateway\Domain\GatewayStreamRepository;
use App\Modules\Gateway\Infrastructure\RedisGatewayStreamRepository;
use Tests\Support\Modules\Gateway\GatewayRedisTestSupport;

beforeEach(fn () => GatewayRedisTestSupport::useIsolatedPrefix());
afterEach(fn () => GatewayRedisTestSupport::flush());

it('binds the interface in the container (happy)', function (): void {
    expect(app(GatewayStreamRepository::class))->toBeInstanceOf(RedisGatewayStreamRepository::class);
});

it('appends and backfills without a cursor (happy)', function (): void {
    $repo = new RedisGatewayStreamRepository;
    $repo->append(7, Direction::In, '{"a":1}');
    $repo->append(7, Direction::Out, '{"b":2}');

    $batch = $repo->tail(7, null, 0);

    expect($batch->messages)->toHaveCount(2);
    expect($batch->messages[0]['direction'])->toBe('in');
    expect($batch->messages[0]['envelope'])->toBe('{"a":1}');
    expect($batch->messages[1]['direction'])->toBe('out');
    expect($batch->reset)->toBeFalse();
    expect($batch->cursor)->toBe($batch->messages[1]['id']);
});

it('tails only entries newer than the cursor (happy)', function (): void {
    $repo = new RedisGatewayStreamRepository;
    $firstId = $repo->append(7, Direction::In, '{"a":1}');
    $repo->append(7, Direction::In, '{"b":2}');

    $batch = $repo->tail(7, $firstId, 0);

    expect($batch->messages)->toHaveCount(1);
    expect($batch->messages[0]['envelope'])->toBe('{"b":2}');
    expect($batch->reset)->toBeFalse();
});

it('returns an empty batch and keeps the cursor on blocking timeout (invalid)', function (): void {
    $repo = new RedisGatewayStreamRepository;
    $lastId = $repo->append(7, Direction::In, '{"a":1}');

    $batch = $repo->tail(7, $lastId, 300);

    expect($batch->messages)->toBe([]);
    expect($batch->cursor)->toBe($lastId);
    expect($batch->reset)->toBeFalse();
});

it('trims to 200 entries and flags reset for a trimmed cursor (garbage volume)', function (): void {
    $repo = new RedisGatewayStreamRepository;
    $staleId = $repo->append(7, Direction::In, '{"i":0}');
    for ($i = 1; $i <= 210; $i++) {
        $repo->append(7, Direction::In, sprintf('{"i":%d}', $i));
    }

    $batch = $repo->tail(7, $staleId, 0);

    expect($batch->reset)->toBeTrue();
    expect($batch->messages)->toHaveCount(200);
    expect($batch->messages[0]['envelope'])->toBe('{"i":11}');
});

it('isolates streams per user (happy)', function (): void {
    $repo = new RedisGatewayStreamRepository;
    $repo->append(1, Direction::In, '{"mine":true}');

    expect($repo->tail(2, null, 0)->messages)->toBe([]);
});
