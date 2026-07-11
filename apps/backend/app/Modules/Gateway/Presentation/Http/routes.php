<?php

declare(strict_types=1);

use App\Modules\Gateway\Presentation\Http\ConsoleController;
use App\Modules\Gateway\Presentation\Http\Middleware\EnsureGatewayToken;
use App\Modules\Gateway\Presentation\Http\PluginTransportController;
use App\Modules\Gateway\Presentation\Http\TokenController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:api', EnsureGatewayToken::class.':require'])
    ->prefix('euroscope')
    ->group(function (): void {
        Route::post('/messages', [PluginTransportController::class, 'store'])->name('api.euroscope.messages');
        Route::get('/poll', [PluginTransportController::class, 'poll'])->name('api.euroscope.poll');
    });

Route::middleware(['auth:api', EnsureGatewayToken::class.':reject'])
    ->prefix('gateway')
    ->group(function (): void {
        Route::post('/commands', [ConsoleController::class, 'send'])
            ->middleware('throttle:gateway-send')
            ->name('api.gateway.commands');
        Route::get('/console/poll', [ConsoleController::class, 'poll'])->name('api.gateway.console.poll');
        Route::post('/token', [TokenController::class, 'rotate'])->name('api.gateway.token.rotate');
        Route::get('/token', [TokenController::class, 'status'])->name('api.gateway.token.status');
    });
