<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Domain;

interface GatewayStreamRepository
{
    /** Append one protocol envelope (raw JSON) to the user's ring buffer. Returns the stream entry ID. */
    public function append(int $userId, Direction $direction, string $envelopeJson): string;

    /**
     * Read the ring buffer. Null $afterId = full backfill (never blocks).
     * With a cursor: blocks up to $blockMs for new entries; flags reset
     * when the cursor predates the oldest retained entry.
     */
    public function tail(int $userId, ?string $afterId, int $blockMs): ConsoleBatch;
}
