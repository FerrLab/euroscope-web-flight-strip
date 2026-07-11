<?php

declare(strict_types=1);

namespace App\Cqrs\Bus\Middleware;

use Closure;
use Illuminate\Support\Facades\Log;

class MetricsMiddleware implements Middleware
{
    public function handle(object $message, Closure $next): mixed
    {
        $start = microtime(true);

        try {
            return $next($message);
        } finally {
            $elapsed = (microtime(true) - $start) * 1000;
            Log::info('cqrs.dispatch.duration_ms', [
                'message' => $message::class,
                'ms' => round($elapsed, 2),
            ]);
        }
    }
}
