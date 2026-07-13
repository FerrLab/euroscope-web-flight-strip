<?php

declare(strict_types=1);

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:api')->get('/user', function (Request $request) {
    return $request->user();
});

require app_path('Modules/Ping/Presentation/Http/routes.php');
require app_path('Modules/Gateway/Presentation/Http/routes.php');
