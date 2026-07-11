<?php

declare(strict_types=1);

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Http\Response;
use Illuminate\Testing\TestResponse;
use ReflectionProperty;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        // The container ships with APP_ENV=local at the OS level, which would
        // otherwise leak into tests and break security checks that key off the
        // "local" shortcut (e.g. Horizon's Horizon::auth bypass). Pin the
        // container env back to "testing" before Laravel boots so feature
        // tests run against a non-local environment.
        $_ENV['APP_ENV'] = 'testing';
        $_SERVER['APP_ENV'] = 'testing';
        putenv('APP_ENV=testing');

        parent::setUp();
    }

    /**
     * @param  array<string, mixed>  $parameters
     * @param  array<string, mixed>  $cookies
     * @param  array<string, mixed>  $files
     * @param  array<string, mixed>  $server
     * @return TestResponse<Response>
     */
    public function call($method, $uri, $parameters = [], $cookies = [], $files = [], $server = [], $content = null)
    {
        $this->forgetApiGuard();

        return parent::call($method, $uri, $parameters, $cookies, $files, $server, $content);
    }

    /**
     * The `api` (Passport TokenGuard) guard caches its resolved user for
     * the lifetime of the container (Illuminate\Auth\AuthManager::guard()).
     * In production, Octane boots a fresh container per request so this
     * never surfaces; in tests, the container survives across every
     * ->withToken(...)->postJson(...) call within a single test method, so
     * a guard resolved for one bearer token would otherwise "stick" and
     * silently keep authenticating later requests that carry a different
     * (or revoked) bearer token.
     *
     * Forgetting only the `api` guard (rather than Auth::forgetGuards())
     * restores per-request isolation for bearer-token tests without
     * disturbing session-based ->actingAs() (guard `web`), which pre-sets
     * its guard's user once and relies on it staying resolved across
     * subsequent calls in the same test.
     */
    private function forgetApiGuard(): void
    {
        $auth = $this->app['auth'];
        $guards = new ReflectionProperty($auth, 'guards');
        $guards->setAccessible(true);
        $resolved = $guards->getValue($auth);
        unset($resolved['api']);
        $guards->setValue($auth, $resolved);
    }
}
