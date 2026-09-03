<?php

declare(strict_types=1);

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Laravel\Passport\Passport;
use Typesense\Client as TypesenseClient;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(TypesenseClient::class, static function ($app): TypesenseClient {
            $config = $app['config']->get('services.typesense', []);

            return new TypesenseClient([
                'api_key' => $config['api_key'] ?? '',
                'nodes' => [[
                    'host' => $config['host'] ?? 'typesense',
                    'port' => (string) ($config['port'] ?? '8108'),
                    'protocol' => $config['protocol'] ?? 'http',
                ]],
                'connection_timeout_seconds' => 2,
            ]);
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Persist Passport encryption keys under storage/passport/ so the
        // dedicated passport-keys named volume retains them across container
        // recreates without dragging the rest of storage/ with it.
        $keyDir = storage_path('passport');
        Passport::loadKeysFrom($keyDir);

        // League\OAuth2\Server requires private key perms in {400,440,600,640,660}.
        // The container entrypoint chmod's these on boot, but Docker Desktop on
        // Windows occasionally fails to preserve Linux perms across volume
        // restores. Re-applying here on every worker boot makes us robust to that.
        $privateKey = $keyDir.'/oauth-private.key';
        $publicKey = $keyDir.'/oauth-public.key';
        if (is_file($privateKey)) {
            @chmod($privateKey, 0o600);
        }
        if (is_file($publicKey)) {
            @chmod($publicKey, 0o660);
        }

        Passport::tokensExpireIn(Carbon::now()->addDays(15));
        Passport::refreshTokensExpireIn(Carbon::now()->addDays(30));
        Passport::personalAccessTokensExpireIn(Carbon::now()->addMonths(6));

        // Allow Scramble's RestrictedDocsAccess middleware to serve /docs/api
        // in testing (so feature tests can hit it) in addition to local. In
        // production this gate falls through to abort(403) until a future
        // policy explicitly grants access.
        Gate::define('viewApiDocs', static fn ($user = null): bool => app()->environment(['local', 'testing']));

        RateLimiter::for('gateway-send', function (Request $request): Limit {
            return Limit::perMinute(60)->by('gateway-send:'.($request->user()->id ?? $request->ip()));
        });

        RateLimiter::for('socialite-exchange', function (Request $request): Limit {
            return Limit::perMinute(20)->by($request->ip());
        });
    }
}
