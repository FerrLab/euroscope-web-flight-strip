<?php

declare(strict_types=1);

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Laravel\Socialite\Contracts\Factory as SocialiteFactory;
use Laravel\Socialite\SocialiteManager;
use SocialiteProviders\Vatsim\Provider as VatsimProvider;

class VatsimSocialiteServiceProvider extends ServiceProvider
{
    public function boot(SocialiteFactory $factory): void
    {
        // SocialiteManager (the runtime implementation) provides
        // buildProvider(); the Factory contract does not declare it.
        assert($factory instanceof SocialiteManager);
        $factory->extend('vatsim', function ($app) use ($factory) {
            return $factory->buildProvider(VatsimProvider::class, (array) $app['config']['services.vatsim']);
        });
    }
}
