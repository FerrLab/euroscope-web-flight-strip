<?php

declare(strict_types=1);

use App\Modules\Ping\Domain\PingNote;

it('constructs with at least one locale (happy)', function (): void {
    $note = new PingNote(['en' => 'hello', 'pt' => 'olá']);
    expect($note->forLocale('en'))->toBe('hello');
    expect($note->forLocale('pt'))->toBe('olá');
});

it('rejects empty locale map (invalid)', function (): void {
    expect(fn () => new PingNote([]))->toThrow(InvalidArgumentException::class);
});

it('rejects non-string values (garbage)', function (): void {
    /** @phpstan-ignore-next-line — intentional type violation under test */
    expect(fn () => new PingNote(['en' => 123]))->toThrow(InvalidArgumentException::class);
});

it('falls back to first available locale when requested locale missing', function (): void {
    $note = new PingNote(['pt' => 'olá']);
    expect($note->forLocale('en'))->toBe('olá'); // fallback
});
