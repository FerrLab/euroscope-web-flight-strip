<?php

declare(strict_types=1);

use App\Cqrs\Command;
use App\Modules\Gateway\Application\Commands\EnqueuePluginCommandCommand;
use App\Modules\Gateway\Application\Commands\EnqueuePluginCommandHandler;
use Spatie\LaravelData\Data;
use Tests\Support\Modules\Gateway\InMemoryCommandQueueRepository;
use Tests\Support\Modules\Gateway\InMemoryGatewayStreamRepository;

/** @return array{EnqueuePluginCommandHandler, InMemoryCommandQueueRepository, InMemoryGatewayStreamRepository} */
function enqueueHandler(): array
{
    $queue = new InMemoryCommandQueueRepository;
    $stream = new InMemoryGatewayStreamRepository;

    return [new EnqueuePluginCommandHandler($queue, $stream), $queue, $stream];
}

it('queues a full envelope and mirrors it outbound (happy)', function (): void {
    [$handler, $queue, $stream] = enqueueHandler();

    $envelope = $handler->handle(new EnqueuePluginCommandCommand(
        userId: 7,
        action: 'set_squawk',
        callsign: 'ABC1234',
        payload: ['code' => '2354'],
        id: 'req-42',
    ));

    expect($envelope)->toBe([
        'type' => 'command',
        'id' => 'req-42',
        'action' => 'set_squawk',
        'callsign' => 'ABC1234',
        'payload' => ['code' => '2354'],
    ]);
    expect($queue->queues[7])->toHaveCount(1);
    expect(json_decode($queue->queues[7][0], true))->toBe($envelope);
    expect($stream->streams[7][0]['direction'])->toBe('out');
    expect($stream->streams[7][0]['envelope'])->toBe($queue->queues[7][0]);
});

it('generates an id when absent (happy)', function (): void {
    [$handler] = enqueueHandler();

    $envelope = $handler->handle(new EnqueuePluginCommandCommand(userId: 7, action: 'ping'));

    expect($envelope['id'])->toBeString();
    expect($envelope['id'])->not->toBe('');
});

it('omits callsign and payload when null (happy)', function (): void {
    [$handler] = enqueueHandler();

    $envelope = $handler->handle(new EnqueuePluginCommandCommand(userId: 7, action: 'list_flights'));

    expect($envelope)->not->toHaveKeys(['callsign', 'payload']);
});

it('rejects an empty action (invalid)', function (): void {
    [$handler] = enqueueHandler();

    expect(fn () => $handler->handle(new EnqueuePluginCommandCommand(userId: 7, action: '  ')))
        ->toThrow(InvalidArgumentException::class);
});

it('rejects a garbage Command type (garbage)', function (): void {
    [$handler] = enqueueHandler();

    $bogus = new class extends Data implements Command
    {
        public function __construct(public string $x = '') {}
    };

    expect(fn () => $handler->handle($bogus))->toThrow(InvalidArgumentException::class);
});
