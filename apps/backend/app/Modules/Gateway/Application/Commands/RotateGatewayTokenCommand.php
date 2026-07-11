<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Commands;

use App\Cqrs\Command;
use App\Modules\Gateway\Domain\GatewayPermission;
use Spatie\LaravelData\Data;

class RotateGatewayTokenCommand extends Data implements Command
{
    public function __construct(public int $userId) {}

    public function permission(): GatewayPermission
    {
        return GatewayPermission::ManageToken;
    }
}
