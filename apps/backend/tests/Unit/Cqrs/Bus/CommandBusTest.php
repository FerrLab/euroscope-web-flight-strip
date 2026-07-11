<?php

declare(strict_types=1);

use App\Cqrs\Bus\Exceptions\NoHandlerForCommand;
use App\Cqrs\Bus\HandlerRegistry;
use App\Cqrs\Bus\LaravelCommandBus;
use App\Cqrs\Bus\Middleware\Middleware;
use App\Cqrs\Command;
use App\Cqrs\CommandHandler;
use Spatie\LaravelData\Data;
use Tests\TestCase;

uses(TestCase::class);

class TestSpyMiddleware implements Middleware
{
    /**
     * @param  array<int, string>  $trace
     */
    public function __construct(public string $name, public array &$trace) {}

    public function handle(object $message, Closure $next): mixed
    {
        $this->trace[] = "before:{$this->name}";
        $result = $next($message);
        $this->trace[] = "after:{$this->name}";

        return $result;
    }
}

class TestRecordCmd extends Data implements Command
{
    public function __construct(public string $note) {}
}

class TestRecordHandler implements CommandHandler
{
    public function handle(Command $command): string
    {
        /** @var TestRecordCmd $command */
        return strtoupper($command->note);
    }
}

it('runs middleware in registered order then handles the command (happy)', function (): void {
    $trace = [];

    $registry = new HandlerRegistry;
    $registry->register(TestRecordCmd::class, TestRecordHandler::class);

    $bus = new LaravelCommandBus(
        $registry,
        app(),
        [
            new TestSpyMiddleware('logging', $trace),
            new TestSpyMiddleware('metrics', $trace),
            new TestSpyMiddleware('authorize', $trace),
            new TestSpyMiddleware('validate', $trace),
            new TestSpyMiddleware('transaction', $trace),
        ],
    );

    $result = $bus->dispatch(new TestRecordCmd('hello'));

    expect($result)->toBe('HELLO');
    expect($trace)->toBe([
        'before:logging', 'before:metrics', 'before:authorize', 'before:validate', 'before:transaction',
        'after:transaction', 'after:validate', 'after:authorize', 'after:metrics', 'after:logging',
    ]);
});

it('throws when no handler is registered (invalid)', function (): void {
    $registry = new HandlerRegistry;
    $bus = new LaravelCommandBus($registry, app(), []);

    expect(fn () => $bus->dispatch(new TestRecordCmd('x')))
        ->toThrow(NoHandlerForCommand::class);
});

it('throws when dispatched with a non-Command (garbage)', function (): void {
    $bus = new LaravelCommandBus(new HandlerRegistry, app(), []);

    /** @phpstan-ignore-next-line — intentional type violation under test */
    expect(fn () => $bus->dispatch(new stdClass))
        ->toThrow(TypeError::class);
});
