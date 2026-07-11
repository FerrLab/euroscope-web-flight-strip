<?php

declare(strict_types=1);

namespace Tests\Support\Modules\Ping;

use App\Modules\Ping\Domain\Ping;
use App\Modules\Ping\Domain\PingRepository;

/**
 * Test double for PingRepository — used by UseCase and Handler unit tests.
 *
 * Kept in tests/Support so it autoloads via the Tests\ PSR-4 prefix and is
 * available regardless of whether Pest runs serially or in --parallel mode
 * (where each test file lives in its own process).
 */
class InMemoryPingRepository implements PingRepository
{
    /** @var array<string, Ping> */
    public array $saved = [];

    public function save(Ping $ping): void
    {
        $this->saved[$ping->id] = $ping;
    }

    public function findById(string $id): ?Ping
    {
        return $this->saved[$id] ?? null;
    }

    public function recentForUser(int $userId, int $limit = 50): array
    {
        $matching = array_values(array_filter($this->saved, fn ($p) => $p->userId === $userId));

        return array_slice($matching, 0, $limit);
    }
}
