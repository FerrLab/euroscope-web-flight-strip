<?php

declare(strict_types=1);

namespace App\Modules\Ping\Domain;

interface PingRepository
{
    public function save(Ping $ping): void;

    public function findById(string $id): ?Ping;

    /** @return array<int, Ping> */
    public function recentForUser(int $userId, int $limit = 50): array;
}
