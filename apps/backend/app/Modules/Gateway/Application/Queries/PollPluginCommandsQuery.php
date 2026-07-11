<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Queries;

use App\Cqrs\Query;
use App\Modules\Gateway\Domain\GatewayPermission;
use Spatie\LaravelData\Data;

class PollPluginCommandsQuery extends Data implements Query
{
    public function __construct(
        public int $userId,
        public int $timeoutSeconds,
    ) {}

    public function permission(): GatewayPermission
    {
        return GatewayPermission::UseGateway;
    }
}
