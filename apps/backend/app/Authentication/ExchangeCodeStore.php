<?php

declare(strict_types=1);

namespace App\Authentication;

use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Str;

/**
 * Single-use handoff for a Socialite-minted Passport Bearer token: the
 * backend stores the token under a random code with a short TTL, and the
 * frontend redeems it exactly once. The Bearer itself never appears in a
 * URL, browser history, or access log — only the code does, and the code
 * is dead the instant it is redeemed.
 */
final class ExchangeCodeStore
{
    public function put(string $token, int $ttlSeconds): string
    {
        $code = Str::random(64);
        Redis::connection()->setex($this->key($code), $ttlSeconds, $token);

        return $code;
    }

    /** Atomic GETDEL — a replayed code can never mint a second session. */
    public function redeem(string $code): ?string
    {
        if ($code === '') {
            return null;
        }

        $value = Redis::connection()->getDel($this->key($code));

        return is_string($value) && $value !== '' ? $value : null;
    }

    private function key(string $code): string
    {
        return config('socialite.exchange.key_prefix').':'.$code;
    }
}
