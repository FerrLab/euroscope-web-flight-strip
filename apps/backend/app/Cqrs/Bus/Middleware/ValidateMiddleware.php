<?php

declare(strict_types=1);

namespace App\Cqrs\Bus\Middleware;

use Closure;
use Illuminate\Support\Facades\Validator;

/**
 * If the dispatched message exposes `rules(): array`, the message's array
 * representation is validated against those rules. Spatie Data subclasses
 * already validate themselves on construction; this middleware is for
 * additional cross-field rules expressed Laravel-style.
 */
class ValidateMiddleware implements Middleware
{
    public function handle(object $message, Closure $next): mixed
    {
        if (method_exists($message, 'rules')) {
            $payload = method_exists($message, 'toArray') ? $message->toArray() : (array) $message;
            Validator::make($payload, $message->rules())->validate();
        }

        return $next($message);
    }
}
