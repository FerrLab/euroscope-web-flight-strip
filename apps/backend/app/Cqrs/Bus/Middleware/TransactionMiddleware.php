<?php

declare(strict_types=1);

namespace App\Cqrs\Bus\Middleware;

use Closure;
use Illuminate\Support\Facades\DB;

/** Wraps command dispatch in a DB transaction. Not used by the QueryBus. */
class TransactionMiddleware implements Middleware
{
    public function handle(object $message, Closure $next): mixed
    {
        return DB::transaction(fn () => $next($message));
    }
}
