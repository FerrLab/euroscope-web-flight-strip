<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Commands;

final class IngestResult
{
    public function __construct(
        public readonly int $stored,
        public readonly int $dropped,
    ) {}
}
