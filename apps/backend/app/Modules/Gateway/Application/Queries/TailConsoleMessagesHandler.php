<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Queries;

use App\Cqrs\Query;
use App\Cqrs\QueryHandler;
use App\Modules\Gateway\Domain\GatewayStreamRepository;
use App\Modules\Gateway\Domain\PluginPresenceRepository;
use InvalidArgumentException;

class TailConsoleMessagesHandler implements QueryHandler
{
    private const MAX_TIMEOUT_SECONDS = 15;

    public function __construct(
        private GatewayStreamRepository $stream,
        private PluginPresenceRepository $presence,
    ) {}

    public function handle(Query $query): ConsoleView
    {
        if (! $query instanceof TailConsoleMessagesQuery) {
            throw new InvalidArgumentException(
                sprintf('%s expects TailConsoleMessagesQuery, got %s', self::class, $query::class),
            );
        }
        if ($query->timeoutSeconds < 0 || $query->timeoutSeconds > self::MAX_TIMEOUT_SECONDS) {
            throw new InvalidArgumentException('timeoutSeconds must be between 0 and '.self::MAX_TIMEOUT_SECONDS);
        }
        if ($query->afterId !== null && preg_match('/^\d+-\d+$/', $query->afterId) !== 1) {
            throw new InvalidArgumentException('afterId must be a Redis stream ID (e.g. 1720527600000-0)');
        }

        $batch = $this->stream->tail($query->userId, $query->afterId, $query->timeoutSeconds * 1_000);

        return new ConsoleView(
            batch: $batch,
            pluginConnected: $this->presence->isConnected($query->userId),
        );
    }
}
