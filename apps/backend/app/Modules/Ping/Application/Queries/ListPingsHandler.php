<?php

declare(strict_types=1);

namespace App\Modules\Ping\Application\Queries;

use App\Cqrs\Query;
use App\Cqrs\QueryHandler;
use App\Modules\Ping\Domain\Ping;
use App\Modules\Ping\Domain\PingRepository;
use InvalidArgumentException;

class ListPingsHandler implements QueryHandler
{
    private const MAX_LIMIT = 500;

    public function __construct(private PingRepository $repository) {}

    /** @return array<int, Ping> */
    public function handle(Query $query): array
    {
        if (! $query instanceof ListPingsQuery) {
            throw new InvalidArgumentException(
                sprintf('%s expects ListPingsQuery, got %s', self::class, $query::class),
            );
        }

        if ($query->limit < 1) {
            throw new InvalidArgumentException('limit must be >= 1');
        }
        if ($query->limit > self::MAX_LIMIT) {
            throw new InvalidArgumentException('limit exceeds MAX_LIMIT='.self::MAX_LIMIT);
        }

        return $this->repository->recentForUser($query->userId, $query->limit);
    }
}
