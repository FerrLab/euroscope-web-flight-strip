<?php

declare(strict_types=1);

namespace App\Cqrs\Bus;

use App\Cqrs\Command;

interface CommandBus
{
    public function dispatch(Command $command): mixed;
}
