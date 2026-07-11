<?php

declare(strict_types=1);

use App\Cqrs\Command;
use App\Modules\Ping\Application\Commands\RecordPingCommand;
use App\Modules\Ping\Application\Commands\RecordPingHandler;
use Spatie\LaravelData\Data;
use Tests\Support\Modules\Ping\InMemoryPingRepository;

it('records a ping for a user (happy)', function (): void {
    $repo = new InMemoryPingRepository;
    $handler = new RecordPingHandler($repo);

    $cmd = new RecordPingCommand(userId: 7, note: ['en' => 'hi']);
    $ping = $handler->handle($cmd);

    expect($ping->userId)->toBe(7);
    expect($repo->saved)->toHaveCount(1);
    expect($repo->saved[$ping->id]->note->forLocale('en'))->toBe('hi');
});

it('rejects userId < 1 (invalid)', function (): void {
    $handler = new RecordPingHandler(new InMemoryPingRepository);
    $cmd = new RecordPingCommand(userId: 0, note: ['en' => 'x']);

    expect(fn () => $handler->handle($cmd))->toThrow(InvalidArgumentException::class);
});

it('rejects empty note as invalid (invalid)', function (): void {
    $handler = new RecordPingHandler(new InMemoryPingRepository);
    $cmd = new RecordPingCommand(userId: 1, note: []);

    expect(fn () => $handler->handle($cmd))->toThrow(InvalidArgumentException::class);
});

it('rejects garbage Command type (garbage)', function (): void {
    $handler = new RecordPingHandler(new InMemoryPingRepository);

    $bogus = new class extends Data implements Command
    {
        public function __construct(public string $note = '') {}
    };

    expect(fn () => $handler->handle($bogus))->toThrow(InvalidArgumentException::class);
});
