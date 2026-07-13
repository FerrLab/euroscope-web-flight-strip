<?php

declare(strict_types=1);

use App\Cqrs\Command;
use App\Modules\Gateway\Application\Commands\RecordPluginMessagesCommand;
use App\Modules\Gateway\Application\Commands\RecordPluginMessagesHandler;
use Spatie\LaravelData\Data;
use Tests\Support\Modules\Gateway\InMemoryGatewayStreamRepository;

it('stores object entries tagged as inbound (happy)', function (): void {
    $stream = new InMemoryGatewayStreamRepository;
    $handler = new RecordPluginMessagesHandler($stream);

    $result = $handler->handle(new RecordPluginMessagesCommand(userId: 7, messages: [
        ['type' => 'event', 'action' => 'flight_updated', 'callsign' => 'DLH4TX'],
        ['type' => 'response', 'action' => 'ping', 'ok' => true],
    ]));

    expect($result->stored)->toBe(2);
    expect($result->dropped)->toBe(0);
    expect($stream->streams[7])->toHaveCount(2);
    expect($stream->streams[7][0]['direction'])->toBe('in');
    expect(json_decode($stream->streams[7][0]['envelope'], true))
        ->toBe(['type' => 'event', 'action' => 'flight_updated', 'callsign' => 'DLH4TX']);
});

it('drops non-object entries without failing the batch (invalid)', function (): void {
    $stream = new InMemoryGatewayStreamRepository;
    $handler = new RecordPluginMessagesHandler($stream);

    $result = $handler->handle(new RecordPluginMessagesCommand(userId: 7, messages: [
        ['type' => 'event', 'action' => 'flight_removed'],
        [1, 2, 3],
        'not-an-object',
        null,
    ]));

    expect($result->stored)->toBe(1);
    expect($result->dropped)->toBe(3);
    expect($stream->streams[7])->toHaveCount(1);
});

it('handles an empty batch (invalid)', function (): void {
    $stream = new InMemoryGatewayStreamRepository;
    $handler = new RecordPluginMessagesHandler($stream);

    $result = $handler->handle(new RecordPluginMessagesCommand(userId: 7, messages: []));

    expect($result->stored)->toBe(0);
    expect($result->dropped)->toBe(0);
    expect($stream->streams)->toBe([]);
});

it('rejects a garbage Command type (garbage)', function (): void {
    $handler = new RecordPluginMessagesHandler(new InMemoryGatewayStreamRepository);

    $bogus = new class extends Data implements Command
    {
        public function __construct(public string $x = '') {}
    };

    expect(fn () => $handler->handle($bogus))->toThrow(InvalidArgumentException::class);
});
