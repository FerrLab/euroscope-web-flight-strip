<?php

declare(strict_types=1);

namespace Tests\Support\Authentication;

use Illuminate\Support\Facades\Redis;

final class SocialiteExchangeRedisTestSupport
{
    /** Point exchange-code keys at a unique prefix so parallel Pest workers never collide. */
    public static function useIsolatedPrefix(): void
    {
        config(['socialite.exchange.key_prefix' => 'authtest:'.getmypid().':'.bin2hex(random_bytes(4))]);
    }

    /** Delete every key under the isolated prefix. */
    public static function flush(): void
    {
        $conn = Redis::connection();
        $clientPrefix = (string) config('database.redis.options.prefix');
        foreach ($conn->keys(config('socialite.exchange.key_prefix').':*') as $key) {
            $bare = str_starts_with((string) $key, $clientPrefix)
                ? substr((string) $key, strlen($clientPrefix))
                : (string) $key;
            $conn->del($bare);
        }
    }
}
