<?php

declare(strict_types=1);

namespace App\Providers;

use App\Authentication\Socialite\StubProvider;
use Illuminate\Support\ServiceProvider;
use Laravel\Socialite\Contracts\Factory as SocialiteFactory;
use Laravel\Socialite\SocialiteManager;

class SocialiteStubServiceProvider extends ServiceProvider
{
    public function boot(SocialiteFactory $factory): void
    {
        // SocialiteManager (the runtime implementation) provides extend(); the
        // Factory contract does not declare it. Assert here so PHPStan can see
        // the concrete capability while DI keeps binding the contract.
        assert($factory instanceof SocialiteManager);
        $factory->extend('stub', function ($app) {
            return new StubProvider($app['request'], 'stub', 'stub-secret', '/auth/socialite/stub/callback');
        });
    }
}
