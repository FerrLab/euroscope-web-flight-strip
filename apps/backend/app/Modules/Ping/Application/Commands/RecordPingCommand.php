<?php

declare(strict_types=1);

namespace App\Modules\Ping\Application\Commands;

use App\Cqrs\Command;
use App\Modules\Ping\Domain\PingPermission;
use Spatie\LaravelData\Data;

class RecordPingCommand extends Data implements Command
{
    /** @param array<string, string> $note */
    public function __construct(
        public int $userId,
        public array $note,
    ) {}

    public function permission(): PingPermission
    {
        return PingPermission::Create;
    }
}
