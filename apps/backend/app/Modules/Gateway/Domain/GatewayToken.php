<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Domain;

use DateTimeImmutable;

final class GatewayToken
{
    public function __construct(
        public readonly string $plainText,
        public readonly DateTimeImmutable $createdAt,
    ) {}
}
