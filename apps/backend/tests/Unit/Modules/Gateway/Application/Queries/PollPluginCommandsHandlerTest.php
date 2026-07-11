<?php

declare(strict_types=1);

use App\Cqrs\Query;
use App\Modules\Gateway\Application\Queries\PollPluginCommandsHandler;
use App\Modules\Gateway\Application\Queries\PollPluginCommandsQuery;
use Spatie\LaravelData\Data;
use Tests\Support\Modules\Gateway\InMemoryCommandQueueRepository;
use Tests\Support\Modules\Gateway\InMemoryPluginPresenceRepository;

it('marks presence and drains the queue (happy)', function (): void {
    $queue = new InMemoryCommandQueueRepository;
    $presence = new InMemoryPluginPresenceRepository;
    $queue->enqueue(7, '{"action":"ping"}');
    $handler = new PollPluginCommandsHandler($queue, $presence);

    $commands = $handler->handle(new PollPluginCommandsQuery(userId: 7, timeoutSeconds: 25));

    expect($commands)->toBe(['{"action":"ping"}']);
    expect($presence->isConnected(7))->toBeTrue();
    expect($queue->lastBlockSeconds)->toBe(25);
});

it('rejects a timeout below 1 second (invalid)', function (): void {
    $handler = new PollPluginCommandsHandler(new InMemoryCommandQueueRepository, new InMemoryPluginPresenceRepository);

    expect(fn () => $handler->handle(new PollPluginCommandsQuery(userId: 7, timeoutSeconds: 0)))
        ->toThrow(InvalidArgumentException::class);
});

it('rejects a timeout above 25 seconds (invalid)', function (): void {
    $handler = new PollPluginCommandsHandler(new InMemoryCommandQueueRepository, new InMemoryPluginPresenceRepository);

    expect(fn () => $handler->handle(new PollPluginCommandsQuery(userId: 7, timeoutSeconds: 26)))
        ->toThrow(InvalidArgumentException::class);
});

it('rejects a garbage Query type (garbage)', function (): void {
    $handler = new PollPluginCommandsHandler(new InMemoryCommandQueueRepository, new InMemoryPluginPresenceRepository);

    $bogus = new class extends Data implements Query
    {
        public function __construct(public string $x = '') {}
    };

    expect(fn () => $handler->handle($bogus))->toThrow(InvalidArgumentException::class);
});
