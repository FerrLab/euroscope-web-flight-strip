<?php

declare(strict_types=1);

namespace App\Cqrs;

interface CommandHandler
{
    public function handle(Command $command): mixed;
}
