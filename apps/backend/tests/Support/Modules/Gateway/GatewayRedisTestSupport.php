<?php

declare(strict_types=1);

namespace Tests\Support\Modules\Gateway;

use Illuminate\Support\Facades\Redis;

final class GatewayRedisTestSupport
{
    /** Point gateway keys at a unique prefix so parallel Pest workers never collide. */
    public static function useIsolatedPrefix(): void
    {
        config(['gateway.key_prefix' => 'gwtest:'.getmypid().':'.bin2hex(random_bytes(4))]);
    }

    /** Delete every key under the isolated prefix. */
    public static function flush(): void
    {
        $conn = Redis::connection();
        // KEYS replies carry the phpredis OPT_PREFIX; DEL re-applies it, so strip first.
        $clientPrefix = (string) config('database.redis.options.prefix');
        foreach ($conn->keys(config('gateway.key_prefix').':*') as $key) {
            $bare = str_starts_with((string) $key, $clientPrefix)
                ? substr((string) $key, strlen($clientPrefix))
                : (string) $key;
            $conn->del($bare);
        }
    }
}
