<?php

declare(strict_types=1);

use App\Cqrs\Bus\Exceptions\NoHandlerForQuery;
use App\Cqrs\Bus\HandlerRegistry;
use App\Cqrs\Bus\LaravelQueryBus;
use App\Cqrs\Bus\Middleware\Middleware;
use App\Cqrs\Query;
use App\Cqrs\QueryHandler;
use Spatie\LaravelData\Data;
use Tests\TestCase;

uses(TestCase::class);

class TestListSpy implements Middleware
{
    /**
     * @param  array<int, string>  $trace
     */
    public function __construct(public string $name, public array &$trace) {}

    public function handle(object $msg, Closure $next): mixed
    {
        $this->trace[] = $this->name;

        return $next($msg);
    }
}

class TestListQuery extends Data implements Query {}

class TestListHandler implements QueryHandler
{
    /**
     * @return array<int, string>
     */
    public function handle(Query $query): array
    {
        return ['ok'];
    }
}

it('runs the query pipeline (no Transaction)', function (): void {
    $trace = [];
    $registry = new HandlerRegistry;
    $registry->register(TestListQuery::class, TestListHandler::class);

    $bus = new LaravelQueryBus($registry, app(), [
        new TestListSpy('logging', $trace),
        new TestListSpy('metrics', $trace),
        new TestListSpy('authorize', $trace),
        new TestListSpy('validate', $trace),
    ]);

    expect($bus->dispatch(new TestListQuery))->toBe(['ok']);
    expect($trace)->toBe(['logging', 'metrics', 'authorize', 'validate']);
});

it('throws when no handler is registered (invalid)', function (): void {
    $bus = new LaravelQueryBus(new HandlerRegistry, app(), []);
    expect(fn () => $bus->dispatch(new TestListQuery))
        ->toThrow(NoHandlerForQuery::class);
});
