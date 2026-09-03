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
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
