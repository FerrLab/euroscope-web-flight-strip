<?php

declare(strict_types=1);

namespace App\Cqrs\Bus\Middleware;

use Closure;
use Illuminate\Support\Facades\Log;
use Throwable;

class LoggingMiddleware implements Middleware
{
    public function handle(object $message, Closure $next): mixed
    {
        Log::debug('cqrs.dispatch.start', ['message' => $message::class]);

        try {
            $result = $next($message);
            Log::debug('cqrs.dispatch.end', ['message' => $message::class, 'ok' => true]);

            return $result;
        } catch (Throwable $e) {
            Log::warning('cqrs.dispatch.error', [
                'message' => $message::class,
                'error' => $e->getMessage(),
            ]);

            throw $e;
        }
    }
}
