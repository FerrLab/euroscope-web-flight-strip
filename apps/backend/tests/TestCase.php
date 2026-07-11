<?php

declare(strict_types=1);

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

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
}
