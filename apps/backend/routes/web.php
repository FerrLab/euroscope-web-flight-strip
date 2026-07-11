<?php

declare(strict_types=1);

use App\Http\Controllers\Auth\SocialiteStubController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/auth/socialite/stub/redirect', [SocialiteStubController::class, 'redirect'])
    ->name('auth.socialite.stub.redirect');
Route::get('/auth/socialite/stub/callback', [SocialiteStubController::class, 'callback'])
    ->name('auth.socialite.stub.callback');
