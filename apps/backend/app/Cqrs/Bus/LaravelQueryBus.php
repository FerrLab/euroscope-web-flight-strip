<?php

declare(strict_types=1);

namespace App\Cqrs\Bus;

use App\Cqrs\Bus\Exceptions\NoHandlerForQuery;
use App\Cqrs\Bus\Middleware\Middleware;
use App\Cqrs\Query;
use App\Cqrs\QueryHandler;
use Closure;
use Illuminate\Contracts\Container\Container;

class LaravelQueryBus implements QueryBus
{
    /**
     * @param  array<int, Middleware>  $middleware
     */
    public function __construct(
        private HandlerRegistry $registry,
        private Container $container,
        private array $middleware,
    ) {}

    public function dispatch(Query $query): mixed
    {
        $handlerClass = $this->registry->handlerFor($query::class)
            ?? throw NoHandlerForQuery::for($query::class);

        $finalHandler = function (object $message) use ($handlerClass): mixed {
            assert($message instanceof Query);
            /** @var QueryHandler $handler */
            $handler = $this->container->make($handlerClass);

            return $handler->handle($message);
        };

        $pipeline = array_reduce(
            array_reverse($this->middleware),
            fn (Closure $next, Middleware $mw): Closure => fn (object $msg): mixed => $mw->handle($msg, $next),
            $finalHandler,
        );

        return $pipeline($query);
    }
}
