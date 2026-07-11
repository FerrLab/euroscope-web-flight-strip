<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Infrastructure;

use App\Cqrs\Bus\HandlerRegistry;
use App\Modules\Gateway\Application\Commands\EnqueuePluginCommandCommand;
use App\Modules\Gateway\Application\Commands\EnqueuePluginCommandHandler;
use App\Modules\Gateway\Application\Commands\RecordPluginMessagesCommand;
use App\Modules\Gateway\Application\Commands\RecordPluginMessagesHandler;
use App\Modules\Gateway\Application\Commands\RotateGatewayTokenCommand;
use App\Modules\Gateway\Application\Commands\RotateGatewayTokenHandler;
use App\Modules\Gateway\Application\Queries\GetTokenStatusHandler;
use App\Modules\Gateway\Application\Queries\GetTokenStatusQuery;
use App\Modules\Gateway\Application\Queries\PollPluginCommandsHandler;
use App\Modules\Gateway\Application\Queries\PollPluginCommandsQuery;
use App\Modules\Gateway\Application\Queries\TailConsoleMessagesHandler;
use App\Modules\Gateway\Application\Queries\TailConsoleMessagesQuery;
use App\Modules\Gateway\Domain\CommandQueueRepository;
use App\Modules\Gateway\Domain\GatewayStreamRepository;
use App\Modules\Gateway\Domain\GatewayTokenRepository;
use App\Modules\Gateway\Domain\PluginPresenceRepository;
use Illuminate\Support\ServiceProvider;

class GatewayServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(
            GatewayStreamRepository::class,
            RedisGatewayStreamRepository::class,
        );
        $this->app->bind(
            CommandQueueRepository::class,
            RedisCommandQueueRepository::class,
        );
        $this->app->bind(
            PluginPresenceRepository::class,
            RedisPluginPresenceRepository::class,
        );
        $this->app->bind(
            GatewayTokenRepository::class,
            PassportGatewayTokenRepository::class,
        );
    }

    public function boot(HandlerRegistry $registry): void
    {
        $registry->register(RecordPluginMessagesCommand::class, RecordPluginMessagesHandler::class);
        $registry->register(EnqueuePluginCommandCommand::class, EnqueuePluginCommandHandler::class);
        $registry->register(RotateGatewayTokenCommand::class, RotateGatewayTokenHandler::class);
        $registry->register(PollPluginCommandsQuery::class, PollPluginCommandsHandler::class);
        $registry->register(TailConsoleMessagesQuery::class, TailConsoleMessagesHandler::class);
        $registry->register(GetTokenStatusQuery::class, GetTokenStatusHandler::class);
    }
}
