<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Domain;

interface CommandQueueRepository
{
    public function enqueue(int $userId, string $envelopeJson): void;

    /**
     * Drain every queued command, blocking up to $blockSeconds for the first.
     *
     * @return array<int, string> raw JSON envelopes, oldest first; [] on timeout
     */
    public function drain(int $userId, int $blockSeconds): array;
}
