<?php

declare(strict_types=1);

use App\Http\Controllers\Auth\SocialiteStubController;
use App\Http\Controllers\Auth\VatsimAuthController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/auth/socialite/stub/redirect', [SocialiteStubController::class, 'redirect'])
    ->name('auth.socialite.stub.redirect');
Route::get('/auth/socialite/stub/callback', [SocialiteStubController::class, 'callback'])
    ->name('auth.socialite.stub.callback');

Route::get('/auth/socialite/vatsim/redirect', [VatsimAuthController::class, 'redirect'])
    ->name('auth.socialite.vatsim.redirect');
Route::get('/auth/socialite/vatsim/callback', [VatsimAuthController::class, 'callback'])
    ->name('auth.socialite.vatsim.callback');
