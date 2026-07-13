<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Domain;

use DateTimeImmutable;

interface GatewayTokenRepository
{
    /** Revoke any existing gateway token and mint a fresh one. */
    public function rotate(int $userId): GatewayToken;

    public function activeTokenCreatedAt(int $userId): ?DateTimeImmutable;
}
