<?php

declare(strict_types=1);

use App\Configuration\ProductionConfigGuard;
use Illuminate\Support\Facades\Log;

it('names every unset production-critical setting (invalid — misconfigured deploy)', function (): void {
    config([
        'app.frontend_url' => 'http://localhost:3000',
        'services.vatsim.client_id' => null,
        'services.vatsim.client_secret' => null,
        'services.vatsim.redirect' => 'http://localhost:8000/auth/socialite/vatsim/callback',
    ]);

    expect(ProductionConfigGuard::problems())
        ->toContain('FRONTEND_URL still points at localhost')
        ->toContain('VATSIM_CLIENT_ID is not set')
        ->toContain('VATSIM_CLIENT_SECRET is not set')
        ->toContain('VATSIM_REDIRECT_URI still points at localhost');
});

it('reports nothing when the deployment is configured (happy)', function (): void {
    config([
        'app.frontend_url' => 'https://eurostrip.ferrlab.com',
        'services.vatsim.client_id' => 'real-client-id',
        'services.vatsim.client_secret' => 'real-client-secret',
        'services.vatsim.redirect' => 'https://api.eurostrip.ferrlab.com/auth/socialite/vatsim/callback',
    ]);

    expect(ProductionConfigGuard::problems())->toBe([]);
});

it('logs a critical in production when something is unset (invalid)', function (): void {
    config([
        'app.frontend_url' => 'http://localhost:3000',
        'services.vatsim.client_id' => 'set',
        'services.vatsim.client_secret' => 'set',
        'services.vatsim.redirect' => 'https://api.eurostrip.ferrlab.com/auth/socialite/vatsim/callback',
    ]);
    $this->app['env'] = 'production';

    Log::shouldReceive('critical')
        ->once()
        ->withArgs(fn (string $message, array $context): bool => str_contains($message, 'misconfigured')
            && $context['problems'] === ['FRONTEND_URL still points at localhost']);

    ProductionConfigGuard::report();

    $this->app['env'] = 'testing';
});

it('stays quiet outside production even when unset (happy — local dev is meant to use localhost)', function (): void {
    config([
        'app.frontend_url' => 'http://localhost:3000',
        'services.vatsim.client_id' => null,
        'services.vatsim.client_secret' => null,
        'services.vatsim.redirect' => 'http://localhost:8000/auth/socialite/vatsim/callback',
    ]);

    Log::shouldReceive('critical')->never();

    ProductionConfigGuard::report();
});

it('treats an empty string the same as unset (garbage)', function (): void {
    config([
        'app.frontend_url' => '',
        'services.vatsim.client_id' => '',
        'services.vatsim.client_secret' => '   ',
        'services.vatsim.redirect' => '',
    ]);

    expect(ProductionConfigGuard::problems())
        ->toContain('FRONTEND_URL is not set')
        ->toContain('VATSIM_CLIENT_ID is not set')
        ->toContain('VATSIM_CLIENT_SECRET is not set')
        ->toContain('VATSIM_REDIRECT_URI is not set');
});
