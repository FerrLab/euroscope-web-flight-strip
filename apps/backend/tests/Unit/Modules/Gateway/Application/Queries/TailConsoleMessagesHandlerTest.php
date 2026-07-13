<?php

declare(strict_types=1);

use App\Cqrs\Query;
use App\Modules\Gateway\Application\Queries\TailConsoleMessagesHandler;
use App\Modules\Gateway\Application\Queries\TailConsoleMessagesQuery;
use App\Modules\Gateway\Domain\ConsoleBatch;
use Spatie\LaravelData\Data;
use Tests\Support\Modules\Gateway\InMemoryGatewayStreamRepository;
use Tests\Support\Modules\Gateway\InMemoryPluginPresenceRepository;

it('returns the batch with plugin presence (happy)', function (): void {
    $stream = new InMemoryGatewayStreamRepository;
    $presence = new InMemoryPluginPresenceRepository;
    $presence->markSeen(7);
    $stream->nextBatch = new ConsoleBatch(
        [['id' => '5-0', 'direction' => 'in', 'envelope' => '{"a":1}']],
        '5-0',
        false,
    );
    $handler = new TailConsoleMessagesHandler($stream, $presence);

    $view = $handler->handle(new TailConsoleMessagesQuery(userId: 7, afterId: '4-0', timeoutSeconds: 15));

    expect($view->batch->messages)->toHaveCount(1);
    expect($view->pluginConnected)->toBeTrue();
    expect($stream->lastBlockMs)->toBe(15_000);
});

it('reports a disconnected plugin (happy)', function (): void {
    $handler = new TailConsoleMessagesHandler(new InMemoryGatewayStreamRepository, new InMemoryPluginPresenceRepository);

    $view = $handler->handle(new TailConsoleMessagesQuery(userId: 7, afterId: null, timeoutSeconds: 0));

    expect($view->pluginConnected)->toBeFalse();
});

it('rejects a negative timeout (invalid)', function (): void {
    $handler = new TailConsoleMessagesHandler(new InMemoryGatewayStreamRepository, new InMemoryPluginPresenceRepository);

    expect(fn () => $handler->handle(new TailConsoleMessagesQuery(userId: 7, afterId: null, timeoutSeconds: -1)))
        ->toThrow(InvalidArgumentException::class);
});

it('rejects a timeout above 15 seconds (invalid)', function (): void {
    $handler = new TailConsoleMessagesHandler(new InMemoryGatewayStreamRepository, new InMemoryPluginPresenceRepository);

    expect(fn () => $handler->handle(new TailConsoleMessagesQuery(userId: 7, afterId: null, timeoutSeconds: 16)))
        ->toThrow(InvalidArgumentException::class);
});

it('rejects a malformed cursor (garbage)', function (): void {
    $handler = new TailConsoleMessagesHandler(new InMemoryGatewayStreamRepository, new InMemoryPluginPresenceRepository);

    expect(fn () => $handler->handle(new TailConsoleMessagesQuery(userId: 7, afterId: 'DROP TABLE', timeoutSeconds: 0)))
        ->toThrow(InvalidArgumentException::class);
});

it('rejects a garbage Query type (garbage)', function (): void {
    $handler = new TailConsoleMessagesHandler(new InMemoryGatewayStreamRepository, new InMemoryPluginPresenceRepository);

    $bogus = new class extends Data implements Query
    {
        public function __construct(public string $x = '') {}
    };

    expect(fn () => $handler->handle($bogus))->toThrow(InvalidArgumentException::class);
});
