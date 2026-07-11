<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Queries;

use App\Modules\Gateway\Domain\ConsoleBatch;

final class ConsoleView
{
    public function __construct(
        public readonly ConsoleBatch $batch,
        public readonly bool $pluginConnected,
    ) {}
}
