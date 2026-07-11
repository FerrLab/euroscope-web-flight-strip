<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Infrastructure;

use App\Modules\Gateway\Domain\ConsoleBatch;
use App\Modules\Gateway\Domain\Direction;
use App\Modules\Gateway\Domain\GatewayStreamRepository;
use Illuminate\Support\Facades\Redis;

final class RedisGatewayStreamRepository implements GatewayStreamRepository
{
    private const RING_SIZE = 200;

    public function append(int $userId, Direction $direction, string $envelopeJson): string
    {
        // Exact MAXLEN (approx = false): deterministic trims, and 200 entries
        // is far too small for approximate node-based trimming to matter.
        $id = Redis::connection()->xAdd($this->key($userId), '*', [
            'direction' => $direction->value,
            'envelope' => $envelopeJson,
        ], self::RING_SIZE, false);

        return (string) $id;
    }

    public function tail(int $userId, ?string $afterId, int $blockMs): ConsoleBatch
    {
        $conn = Redis::connection();
        $key = $this->key($userId);

        if ($afterId === null) {
            $entries = $conn->xRange($key, '-', '+', self::RING_SIZE);

            return $this->batchFrom(is_array($entries) ? $entries : [], reset: false, fallbackCursor: null);
        }

        // A cursor older than the oldest retained entry means the ring trimmed
        // past it — the client has a gap and must replace, not append.
        $oldest = $conn->xRange($key, '-', '+', 1);
        if (is_array($oldest) && $oldest !== [] && self::isBefore($afterId, (string) array_key_first($oldest))) {
            $entries = $conn->xRange($key, '-', '+', self::RING_SIZE);

            return $this->batchFrom(is_array($entries) ? $entries : [], reset: true, fallbackCursor: null);
        }

        // XREAD BLOCK doubles as the long-poll wait: returns immediately when
        // entries newer than the cursor exist, otherwise holds up to $blockMs.
        // phpredis returns false on timeout; replies key by the *prefixed*
        // stream name, so take the first value instead of matching the key.
        $reply = $blockMs > 0
            ? $conn->xRead([$key => $afterId], self::RING_SIZE, $blockMs)
            : $conn->xRead([$key => $afterId], self::RING_SIZE);
        $entries = is_array($reply) && $reply !== [] ? (array) reset($reply) : [];

        return $this->batchFrom($entries, reset: false, fallbackCursor: $afterId);
    }

    /** @param array<int|string, mixed> $entries */
    private function batchFrom(array $entries, bool $reset, ?string $fallbackCursor): ConsoleBatch
    {
        $messages = [];
        $cursor = $fallbackCursor;
        foreach ($entries as $id => $fields) {
            $fields = (array) $fields;
            $messages[] = [
                'id' => (string) $id,
                'direction' => (string) ($fields['direction'] ?? ''),
                'envelope' => (string) ($fields['envelope'] ?? ''),
            ];
            $cursor = (string) $id;
        }

        return new ConsoleBatch($messages, $cursor, $reset);
    }

    private static function isBefore(string $a, string $b): bool
    {
        [$aMs, $aSeq] = array_map(intval(...), explode('-', $a) + [1 => '0']);
        [$bMs, $bSeq] = array_map(intval(...), explode('-', $b) + [1 => '0']);

        return $aMs < $bMs || ($aMs === $bMs && $aSeq < $bSeq);
    }

    private function key(int $userId): string
    {
        return config('gateway.key_prefix').':'.$userId.':messages';
    }
}
