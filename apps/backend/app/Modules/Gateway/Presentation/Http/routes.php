<?php

declare(strict_types=1);

use App\Modules\Gateway\Presentation\Http\Middleware\EnsureGatewayToken;
use App\Modules\Gateway\Presentation\Http\PluginTransportController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:api', EnsureGatewayToken::class.':require'])
    ->prefix('euroscope')
    ->group(function (): void {
        Route::post('/messages', [PluginTransportController::class, 'store'])->name('api.euroscope.messages');
        Route::get('/poll', [PluginTransportController::class, 'poll'])->name('api.euroscope.poll');
    });
