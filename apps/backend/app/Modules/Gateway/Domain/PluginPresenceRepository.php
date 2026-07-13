<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Domain;

interface PluginPresenceRepository
{
    public function markSeen(int $userId): void;

    public function isConnected(int $userId): bool;
}
