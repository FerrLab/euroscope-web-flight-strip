<?php

declare(strict_types=1);

use App\Cqrs\Query;
use App\Modules\Ping\Application\Queries\ListPingsHandler;
use App\Modules\Ping\Application\Queries\ListPingsQuery;
use App\Modules\Ping\Domain\Ping;
use App\Modules\Ping\Domain\PingNote;
use Spatie\LaravelData\Data;
use Tests\Support\Modules\Ping\InMemoryPingRepository;

beforeEach(function (): void {
    $this->repo = new InMemoryPingRepository;
    $this->repo->save(new Ping('a', 1, new PingNote(['en' => 'one']), new DateTimeImmutable));
    $this->repo->save(new Ping('b', 1, new PingNote(['en' => 'two']), new DateTimeImmutable));
    $this->repo->save(new Ping('c', 2, new PingNote(['en' => 'three']), new DateTimeImmutable));
});

it('returns recent pings for a user (happy)', function (): void {
    $handler = new ListPingsHandler($this->repo);
    $result = $handler->handle(new ListPingsQuery(userId: 1, limit: 50));

    expect($result)->toHaveCount(2);
});

it('rejects negative limit (invalid)', function (): void {
    $handler = new ListPingsHandler($this->repo);

    expect(fn () => $handler->handle(new ListPingsQuery(userId: 1, limit: -1)))
        ->toThrow(InvalidArgumentException::class);
});

it('rejects limit beyond ceiling (invalid)', function (): void {
    $handler = new ListPingsHandler($this->repo);

    expect(fn () => $handler->handle(new ListPingsQuery(userId: 1, limit: 99999)))
        ->toThrow(InvalidArgumentException::class);
});

it('rejects garbage Query type (garbage)', function (): void {
    $handler = new ListPingsHandler($this->repo);

    $bogus = new class extends Data implements Query {};

    expect(fn () => $handler->handle($bogus))->toThrow(InvalidArgumentException::class);
});
