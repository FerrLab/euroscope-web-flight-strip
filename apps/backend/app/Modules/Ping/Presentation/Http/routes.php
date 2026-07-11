<?php

declare(strict_types=1);

use App\Modules\Ping\Presentation\Http\PingController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:api')->prefix('ping')->group(function () {
    Route::get('/', [PingController::class, 'index'])->name('api.ping.index');
    Route::post('/', [PingController::class, 'store'])->name('api.ping.store');
});
