<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Infrastructure;

use App\Modules\Gateway\Domain\PluginPresenceRepository;
use Illuminate\Support\Facades\Redis;

final class RedisPluginPresenceRepository implements PluginPresenceRepository
{
    // Must outlive one 25s plugin poll cycle plus latency slack.
    private const TTL_SECONDS = 35;

    public function markSeen(int $userId): void
    {
        Redis::connection()->setEx($this->key($userId), self::TTL_SECONDS, '1');
    }

    public function isConnected(int $userId): bool
    {
        return (bool) Redis::connection()->exists($this->key($userId));
    }

    private function key(int $userId): string
    {
        return config('gateway.key_prefix').':'.$userId.':plugin-seen';
    }
}
