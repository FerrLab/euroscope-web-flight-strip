<?php

declare(strict_types=1);

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // The Next.js server redeems the one-time Socialite exchange code with a
        // plain server-to-server POST — no browser session, no CSRF token — so
        // the default `web` CSRF guard would reject it with 419 everywhere
        // except the test environment (where the middleware short-circuits on
        // runningUnitTests()). The endpoint's protection is the code itself:
        // 64 characters of entropy, single-use, 60-second TTL, rate-limited.
        // preventRequestForgery() is the current API; validateCsrfTokens() is
        // deprecated in this Laravel version and merely proxies to it. The
        // `except` entries are URI patterns matched via $request->is().
        $middleware->preventRequestForgery(except: [
            'auth/socialite/exchange',
        ]);

        // Cloudflare terminates TLS and forwards to Octane over plain HTTP.
        // TrustProxies ships in Laravel's default stack but its handle() calls
        // setTrustedProxies([], ...) until told otherwise, so X-Forwarded-Proto
        // was discarded and every generated URL came out http:// -- each
        // redirect then cost an extra Cloudflare 301 back to https, and the
        // browser briefly left over plaintext :80. The origin is not publicly
        // routable; Cloudflare is the only ingress, so every proxy in front of
        // this app is ours.
        $middleware->trustProxies(at: '*');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
