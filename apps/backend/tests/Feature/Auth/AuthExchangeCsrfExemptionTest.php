<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

/*
 * Laravel's PreventRequestForgery middleware short-circuits whenever
 * $app->runningInConsole() && $app->runningUnitTests(), and
 * Application::runningUnitTests() is simply `$this['env'] === 'testing'`
 * (vendor/laravel/framework/src/Illuminate/Foundation/Application.php:832).
 * So the whole backend suite normally proves nothing about CSRF at all.
 *
 * Flipping app['env'] away from 'testing' (the same technique
 * SocialiteStubProductionGateTest uses) turns the real check back on, which is
 * the only way to prove the `except` entry in bootstrap/app.php actually
 * shields the exchange endpoint from the 419 that every real Next.js
 * server-to-server POST would otherwise receive.
 */

afterEach(function (): void {
    $this->app['env'] = 'testing';
});

it('rejects an unexcepted web POST with 419 once CSRF verification is genuinely active (control)', function (): void {
    Route::middleware('web')->post('/__csrf-probe', fn () => response('ok'));

    $this->app['env'] = 'production';

    $this->postJson('/__csrf-probe', [])->assertStatus(419);
});

it('lets the exchange endpoint through without a CSRF token (happy — the Next.js server POST carries none)', function (): void {
    $this->app['env'] = 'production';

    // 422 is the controller's own "unknown code" answer — i.e. the request
    // reached the controller. A 419 here would mean CSRF rejected it first.
    $this->postJson('/auth/socialite/exchange', ['code' => 'never-issued'])->assertStatus(422);
});
