<?php

declare(strict_types=1);

namespace App\Providers;

use App\Authorization\Roles\Role;
use Illuminate\Support\Facades\Gate;
use Laravel\Horizon\HorizonApplicationServiceProvider;

class HorizonServiceProvider extends HorizonApplicationServiceProvider
{
    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        parent::boot();

        // Horizon::routeSmsNotificationsTo('15556667777');
        // Horizon::routeMailNotificationsTo('example@example.com');
        // Horizon::routeSlackNotificationsTo('slack-webhook-url', '#channel');
    }

    /**
     * Register the Horizon gate.
     *
     * Restricts the /horizon UI to users carrying the Admin role.
     */
    protected function gate(): void
    {
        Gate::define('viewHorizon', function ($user = null): bool {
            return $user !== null && $user->hasRole(Role::Admin->value);
        });
    }
}
