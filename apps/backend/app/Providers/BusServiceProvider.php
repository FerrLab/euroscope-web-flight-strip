<?php

declare(strict_types=1);

namespace App\Providers;

use App\Cqrs\Bus\CommandBus;
use App\Cqrs\Bus\HandlerRegistry;
use App\Cqrs\Bus\LaravelCommandBus;
use App\Cqrs\Bus\LaravelQueryBus;
use App\Cqrs\Bus\Middleware\AuthorizeMiddleware;
use App\Cqrs\Bus\Middleware\LoggingMiddleware;
use App\Cqrs\Bus\Middleware\MetricsMiddleware;
use App\Cqrs\Bus\Middleware\TransactionMiddleware;
use App\Cqrs\Bus\Middleware\ValidateMiddleware;
use App\Cqrs\Bus\QueryBus;
use Illuminate\Support\ServiceProvider;

class BusServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(HandlerRegistry::class);

        $this->app->singleton(CommandBus::class, function ($app) {
            return new LaravelCommandBus(
                $app->make(HandlerRegistry::class),
                $app,
                [
                    $app->make(LoggingMiddleware::class),
                    $app->make(MetricsMiddleware::class),
                    $app->make(AuthorizeMiddleware::class),
                    $app->make(ValidateMiddleware::class),
                    $app->make(TransactionMiddleware::class),
                ],
            );
        });

        $this->app->singleton(QueryBus::class, function ($app) {
            return new LaravelQueryBus(
                $app->make(HandlerRegistry::class),
                $app,
                [
                    $app->make(LoggingMiddleware::class),
                    $app->make(MetricsMiddleware::class),
                    $app->make(AuthorizeMiddleware::class),
                    $app->make(ValidateMiddleware::class),
                ],
            );
        });
    }
}
