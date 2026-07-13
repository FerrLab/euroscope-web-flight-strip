<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Infrastructure;

use App\Modules\Gateway\Domain\CommandQueueRepository;
use Illuminate\Support\Facades\Redis;

final class RedisCommandQueueRepository implements CommandQueueRepository
{
    private const DRAIN_REST = 199;

    public function enqueue(int $userId, string $envelopeJson): void
    {
        Redis::connection()->rPush($this->key($userId), $envelopeJson);
    }

    public function drain(int $userId, int $blockSeconds): array
    {
        $conn = Redis::connection();
        $key = $this->key($userId);

        // BLPOP 0 would block forever — clamp to at least 1 second.
        $first = $conn->blPop([$key], max(1, $blockSeconds));
        if (! is_array($first) || count($first) < 2) {
            return [];
        }

        // One command woke us; grab whatever else queued up without blocking
        // so a burst goes out to the plugin in a single poll response.
        $items = [(string) $first[1]];
        $rest = $conn->lPop($key, self::DRAIN_REST);
        foreach (is_array($rest) ? $rest : [] as $value) {
            $items[] = (string) $value;
        }

        return $items;
    }

    private function key(int $userId): string
    {
        return config('gateway.key_prefix').':'.$userId.':commands';
    }
}
