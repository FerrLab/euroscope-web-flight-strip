<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Domain;

use App\Authorization\Contracts\Permission;

enum GatewayPermission: string implements Permission
{
    case UseGateway = 'gateway.use';
    case UseConsole = 'gateway.console';
    case ManageToken = 'gateway.token';
}
