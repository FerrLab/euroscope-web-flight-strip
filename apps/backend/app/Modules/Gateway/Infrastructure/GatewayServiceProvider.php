<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Infrastructure;

use App\Modules\Gateway\Domain\GatewayStreamRepository;
use Illuminate\Support\ServiceProvider;

class GatewayServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(
            GatewayStreamRepository::class,
            RedisGatewayStreamRepository::class,
        );
    }

    public function boot(): void
    {
        //
    }
}
