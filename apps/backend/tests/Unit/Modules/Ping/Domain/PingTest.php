<?php

declare(strict_types=1);

use App\Modules\Ping\Domain\Ping;
use App\Modules\Ping\Domain\PingNote;

it('records who pinged and when (happy)', function (): void {
    $ping = new Ping(
        id: 'p-1',
        userId: 7,
        note: new PingNote(['en' => 'hello']),
        createdAt: new DateTimeImmutable('2026-05-05T12:00:00Z'),
    );

    expect($ping->id)->toBe('p-1');
    expect($ping->userId)->toBe(7);
    expect($ping->note->forLocale('en'))->toBe('hello');
});

it('rejects empty id (invalid)', function (): void {
    expect(fn () => new Ping(
        id: '',
        userId: 1,
        note: new PingNote(['en' => 'x']),
        createdAt: new DateTimeImmutable,
    ))->toThrow(InvalidArgumentException::class);
});

it('rejects negative userId (garbage)', function (): void {
    expect(fn () => new Ping(
        id: 'p-1',
        userId: -1,
        note: new PingNote(['en' => 'x']),
        createdAt: new DateTimeImmutable,
    ))->toThrow(InvalidArgumentException::class);
});
