<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Queries;

use App\Cqrs\Query;
use App\Cqrs\QueryHandler;
use App\Modules\Gateway\Domain\GatewayTokenRepository;
use DateTimeImmutable;
use InvalidArgumentException;

class GetTokenStatusHandler implements QueryHandler
{
    public function __construct(private GatewayTokenRepository $tokens) {}

    public function handle(Query $query): ?DateTimeImmutable
    {
        if (! $query instanceof GetTokenStatusQuery) {
            throw new InvalidArgumentException(
                sprintf('%s expects GetTokenStatusQuery, got %s', self::class, $query::class),
            );
        }

        return $this->tokens->activeTokenCreatedAt($query->userId);
    }
}
