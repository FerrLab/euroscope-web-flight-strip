<?php

declare(strict_types=1);

namespace App\Cqrs\Bus\Middleware;

use Closure;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\Gate;

/**
 * If the dispatched message exposes `permission(): \App\Authorization\Contracts\Permission`,
 * the current user must be allowed by Gate::authorize. Messages without the method are
 * unauthorized — every command/query must declare its permission explicitly.
 */
class AuthorizeMiddleware implements Middleware
{
    public function handle(object $message, Closure $next): mixed
    {
        if (! method_exists($message, 'permission')) {
            throw new AuthorizationException(
                'Message ['.$message::class.'] must declare permission(): Permission',
            );
        }

        Gate::authorize($message->permission()->value);

        return $next($message);
    }
}
