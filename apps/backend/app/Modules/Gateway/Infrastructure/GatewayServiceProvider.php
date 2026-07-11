<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Infrastructure;

use App\Modules\Gateway\Domain\CommandQueueRepository;
use App\Modules\Gateway\Domain\GatewayStreamRepository;
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
    }

    public function boot(): void
    {
        //
    }
}
