<?php

declare(strict_types=1);

namespace App\Modules\Ping\Infrastructure;

use App\Cqrs\Bus\HandlerRegistry;
use App\Modules\Ping\Application\Commands\RecordPingCommand;
use App\Modules\Ping\Application\Commands\RecordPingHandler;
use App\Modules\Ping\Application\Queries\ListPingsHandler;
use App\Modules\Ping\Application\Queries\ListPingsQuery;
use App\Modules\Ping\Domain\PingRepository;
use Illuminate\Support\ServiceProvider;

class PingServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(PingRepository::class, EloquentPingRepository::class);
    }

    public function boot(HandlerRegistry $registry): void
    {
        $registry->register(RecordPingCommand::class, RecordPingHandler::class);
        $registry->register(ListPingsQuery::class, ListPingsHandler::class);
    }
}
