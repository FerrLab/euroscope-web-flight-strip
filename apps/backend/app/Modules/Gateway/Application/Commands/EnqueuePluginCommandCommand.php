<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Commands;

use App\Cqrs\Command;
use App\Modules\Gateway\Domain\GatewayPermission;
use Spatie\LaravelData\Data;

class EnqueuePluginCommandCommand extends Data implements Command
{
    /** @param array<string, mixed>|null $payload */
    public function __construct(
        public int $userId,
        public string $action,
        public ?string $callsign = null,
        public ?array $payload = null,
        public string|int|null $id = null,
    ) {}

    public function permission(): GatewayPermission
    {
        return GatewayPermission::UseConsole;
    }
}
