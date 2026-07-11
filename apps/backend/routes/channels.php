<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('ping.{userId}', function ($user, int $userId) {
    return (int) $user->id === $userId;
});
