<?php

declare(strict_types=1);

use App\Modules\Ping\Infrastructure\PingServiceProvider;
use App\Providers\AppServiceProvider;
use App\Providers\BusServiceProvider;
use App\Providers\Filament\AdminPanelProvider;
use App\Providers\HorizonServiceProvider;
use App\Providers\SocialiteStubServiceProvider;

return [
    AppServiceProvider::class,
    AdminPanelProvider::class,
    HorizonServiceProvider::class,
    SocialiteStubServiceProvider::class,
    BusServiceProvider::class,
    PingServiceProvider::class,
];
