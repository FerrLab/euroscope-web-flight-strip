<?php

declare(strict_types=1);

namespace App\Modules\Ping\Infrastructure;

use App\Modules\Ping\Domain\Ping;
use App\Modules\Ping\Domain\PingNote;
use App\Modules\Ping\Domain\PingRepository;
use DateTimeImmutable;

class EloquentPingRepository implements PingRepository
{
    public function save(Ping $ping): void
    {
        PingModel::query()->updateOrCreate(
            ['id' => $ping->id],
            [
                'user_id' => $ping->userId,
                'note' => $ping->note->translations,
                'created_at' => $ping->createdAt,
            ],
        );
    }

    public function findById(string $id): ?Ping
    {
        $row = PingModel::query()->find($id);

        return $row ? $this->toDomain($row) : null;
    }

    /** @return array<int, Ping> */
    public function recentForUser(int $userId, int $limit = 50): array
    {
        return PingModel::query()
            ->where('user_id', $userId)
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get()
            ->map(fn (PingModel $m) => $this->toDomain($m))
            ->all();
    }

    private function toDomain(PingModel $row): Ping
    {
        $createdAt = $row->created_at;
        assert($createdAt !== null);

        return new Ping(
            id: (string) $row->id,
            userId: (int) $row->user_id,
            note: new PingNote($row->getTranslations('note')),
            createdAt: DateTimeImmutable::createFromInterface($createdAt),
        );
    }
}
