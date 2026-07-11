<?php

declare(strict_types=1);

use App\Cqrs\Command;
use App\Cqrs\CommandHandler;
use App\Cqrs\Query;
use App\Cqrs\QueryHandler;
use Spatie\LaravelData\Data;
use Tests\TestCase;

uses(TestCase::class);

it('Command is a marker interface implemented by a Spatie Data subclass', function (): void {
    $cmd = new class('hello') extends Data implements Command
    {
        public function __construct(public string $note) {}
    };

    expect($cmd)->toBeInstanceOf(Command::class)->and($cmd)->toBeInstanceOf(Data::class);
});

it('Query is a marker interface', function (): void {
    $q = new class extends Data implements Query {};
    expect($q)->toBeInstanceOf(Query::class);
});

it('CommandHandler and QueryHandler require a handle() method', function (): void {
    /** @phpstan-ignore-next-line — contract assertion */
    expect(method_exists(CommandHandler::class, 'handle'))->toBeTrue();
    /** @phpstan-ignore-next-line — contract assertion */
    expect(method_exists(QueryHandler::class, 'handle'))->toBeTrue();
});
