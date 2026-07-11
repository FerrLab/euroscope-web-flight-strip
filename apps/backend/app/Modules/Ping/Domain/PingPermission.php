<?php

declare(strict_types=1);

namespace App\Modules\Ping\Domain;

use App\Authorization\Contracts\Permission;

enum PingPermission: string implements Permission
{
    case View = 'ping.view';
    case Create = 'ping.create';
}
