<?php

declare(strict_types=1);

namespace Tests\Support\Modules\Gateway;

use App\Modules\Gateway\Domain\GatewayToken;
use App\Modules\Gateway\Domain\GatewayTokenRepository;
use DateTimeImmutable;

final class InMemoryGatewayTokenRepository implements GatewayTokenRepository
{
    public int $rotations = 0;

    public ?DateTimeImmutable $createdAt = null;

    public function rotate(int $userId): GatewayToken
    {
        $this->rotations++;
        $this->createdAt = new DateTimeImmutable('2026-07-10T12:00:00+00:00');

        return new GatewayToken('secret-'.$this->rotations, $this->createdAt);
    }

    public function activeTokenCreatedAt(int $userId): ?DateTimeImmutable
    {
        return $this->createdAt;
    }
}
