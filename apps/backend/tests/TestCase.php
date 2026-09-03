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
        // The container ships with APP_ENV=local and a real DB_CONNECTION at
        // the OS level (docker-compose exports them for the running app).
        // PHPUnit's <env force="true"> only writes $_ENV + putenv(), not
        // $_SERVER — and Laravel's env() reads $_SERVER first — so those
        // real values would otherwise silently win over phpunit.xml and
        // point RefreshDatabase at the real Postgres database instead of
        // sqlite :memory:. Mirror every phpunit.xml-forced key into
        // $_SERVER too, before Laravel boots. Do not remove this.
        foreach ([
            'APP_ENV' => 'testing',
            'DB_CONNECTION' => 'sqlite',
            'DB_DATABASE' => ':memory:',
            'DB_URL' => '',
        ] as $key => $value) {
            $_ENV[$key] = $value;
            $_SERVER[$key] = $value;
            putenv("{$key}={$value}");
        }

        parent::setUp();

        // Belt-and-braces: hard-fail rather than silently run a Feature
        // test's RefreshDatabase against a real database.
        if (config('database.default') !== 'sqlite') {
            throw new \RuntimeException(
                'Refusing to run tests: database.default is "'.config('database.default').'", not "sqlite". '.
                'This guards against RefreshDatabase running against a real Postgres database — see [[backend-test-isolation]].',
            );
        }
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
