<?php

declare(strict_types=1);

use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case bindings
|--------------------------------------------------------------------------
|
| Feature tests get the Laravel-aware Tests\TestCase so they have access to
| the application kernel, HTTP helpers, and DB. Unit tests stay
| framework-free and extend PHPUnit\Framework\TestCase by default — that's
| intentional and supports the SOLID layering: framework-free UseCases
| should be unit-testable without booting Laravel.
|
*/

pest()->extend(TestCase::class)->in('Feature');
