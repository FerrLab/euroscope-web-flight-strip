<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Commands;

use App\Cqrs\Command;
use App\Modules\Gateway\Domain\GatewayPermission;
use Spatie\LaravelData\Data;

class RecordPluginMessagesCommand extends Data implements Command
{
    /** @param array<int, mixed> $messages Raw decoded batch entries; the handler filters non-objects. */
    public function __construct(
        public int $userId,
        public array $messages,
    ) {}

    public function permission(): GatewayPermission
    {
        return GatewayPermission::UseGateway;
    }
}
