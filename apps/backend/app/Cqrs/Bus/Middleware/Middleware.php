<?php

declare(strict_types=1);

namespace App\Cqrs\Bus\Middleware;

use Closure;

interface Middleware
{
    public function handle(object $message, Closure $next): mixed;
}
