<?php

declare(strict_types=1);

namespace Tests\Support\Modules\Gateway;

use App\Modules\Gateway\Domain\PluginPresenceRepository;

final class InMemoryPluginPresenceRepository implements PluginPresenceRepository
{
    /** @var array<int, bool> */
    public array $seen = [];

    public function markSeen(int $userId): void
    {
        $this->seen[$userId] = true;
    }

    public function isConnected(int $userId): bool
    {
        return $this->seen[$userId] ?? false;
    }
}
