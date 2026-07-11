<?php

declare(strict_types=1);

namespace Tests\Support\Modules\Gateway;

use App\Modules\Gateway\Domain\CommandQueueRepository;

final class InMemoryCommandQueueRepository implements CommandQueueRepository
{
    /** @var array<int, array<int, string>> */
    public array $queues = [];

    public ?int $lastBlockSeconds = null;

    public function enqueue(int $userId, string $envelopeJson): void
    {
        $this->queues[$userId][] = $envelopeJson;
    }

    public function drain(int $userId, int $blockSeconds): array
    {
        $this->lastBlockSeconds = $blockSeconds;
        $items = $this->queues[$userId] ?? [];
        $this->queues[$userId] = [];

        return $items;
    }
}
