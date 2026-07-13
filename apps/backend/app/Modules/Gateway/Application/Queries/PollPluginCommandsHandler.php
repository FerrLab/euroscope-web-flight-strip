<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Queries;

use App\Cqrs\Query;
use App\Cqrs\QueryHandler;
use App\Modules\Gateway\Domain\CommandQueueRepository;
use App\Modules\Gateway\Domain\PluginPresenceRepository;
use InvalidArgumentException;

class PollPluginCommandsHandler implements QueryHandler
{
    private const MAX_TIMEOUT_SECONDS = 25;

    public function __construct(
        private CommandQueueRepository $queue,
        private PluginPresenceRepository $presence,
    ) {}

    /** @return array<int, string> */
    public function handle(Query $query): array
    {
        if (! $query instanceof PollPluginCommandsQuery) {
            throw new InvalidArgumentException(
                sprintf('%s expects PollPluginCommandsQuery, got %s', self::class, $query::class),
            );
        }
        if ($query->timeoutSeconds < 1 || $query->timeoutSeconds > self::MAX_TIMEOUT_SECONDS) {
            throw new InvalidArgumentException('timeoutSeconds must be between 1 and '.self::MAX_TIMEOUT_SECONDS);
        }

        // Polling IS the liveness signal: the console's "connected" badge
        // keys off this mark plus its 35s TTL.
        $this->presence->markSeen($query->userId);

        return $this->queue->drain($query->userId, $query->timeoutSeconds);
    }
}
