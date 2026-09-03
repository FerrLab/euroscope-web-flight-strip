<?php

declare(strict_types=1);

use App\Modules\Gateway\Infrastructure\GatewayServiceProvider;
use App\Modules\Ping\Infrastructure\PingServiceProvider;
use App\Providers\AppServiceProvider;
use App\Providers\BusServiceProvider;
use App\Providers\Filament\AdminPanelProvider;
use App\Providers\HorizonServiceProvider;
use App\Providers\SocialiteStubServiceProvider;
use App\Providers\VatsimSocialiteServiceProvider;

return [
    AppServiceProvider::class,
    AdminPanelProvider::class,
    HorizonServiceProvider::class,
    SocialiteStubServiceProvider::class,
    VatsimSocialiteServiceProvider::class,
    BusServiceProvider::class,
    PingServiceProvider::class,
    GatewayServiceProvider::class,
];
