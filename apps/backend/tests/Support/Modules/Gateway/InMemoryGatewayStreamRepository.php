<?php

declare(strict_types=1);

namespace Tests\Support\Modules\Gateway;

use App\Modules\Gateway\Domain\ConsoleBatch;
use App\Modules\Gateway\Domain\Direction;
use App\Modules\Gateway\Domain\GatewayStreamRepository;

final class InMemoryGatewayStreamRepository implements GatewayStreamRepository
{
    /** @var array<int, array<int, array{id: string, direction: string, envelope: string}>> */
    public array $streams = [];

    public ConsoleBatch $nextBatch;

    public ?int $lastBlockMs = null;

    private int $seq = 0;

    public function __construct()
    {
        $this->nextBatch = new ConsoleBatch([], null, false);
    }

    public function append(int $userId, Direction $direction, string $envelopeJson): string
    {
        $id = (++$this->seq).'-0';
        $this->streams[$userId][] = [
            'id' => $id,
            'direction' => $direction->value,
            'envelope' => $envelopeJson,
        ];

        return $id;
    }

    public function tail(int $userId, ?string $afterId, int $blockMs): ConsoleBatch
    {
        $this->lastBlockMs = $blockMs;

        return $this->nextBatch;
    }
}
