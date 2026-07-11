<?php

declare(strict_types=1);

namespace App\Cqrs\Bus;

use App\Cqrs\Bus\Exceptions\NoHandlerForCommand;
use App\Cqrs\Bus\Middleware\Middleware;
use App\Cqrs\Command;
use App\Cqrs\CommandHandler;
use Closure;
use Illuminate\Contracts\Container\Container;

class LaravelCommandBus implements CommandBus
{
    /**
     * @param  array<int, Middleware>  $middleware
     */
    public function __construct(
        private HandlerRegistry $registry,
        private Container $container,
        private array $middleware,
    ) {}

    public function dispatch(Command $command): mixed
    {
        $handlerClass = $this->registry->handlerFor($command::class)
            ?? throw NoHandlerForCommand::for($command::class);

        $finalHandler = function (object $message) use ($handlerClass): mixed {
            assert($message instanceof Command);
            /** @var CommandHandler $handler */
            $handler = $this->container->make($handlerClass);

            return $handler->handle($message);
        };

        $pipeline = array_reduce(
            array_reverse($this->middleware),
            fn (Closure $next, Middleware $mw): Closure => fn (object $msg): mixed => $mw->handle($msg, $next),
            $finalHandler,
        );

        return $pipeline($command);
    }
}
