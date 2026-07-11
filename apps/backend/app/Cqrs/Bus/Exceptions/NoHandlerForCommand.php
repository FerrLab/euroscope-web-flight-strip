<?php

declare(strict_types=1);

namespace App\Cqrs\Bus\Exceptions;

use RuntimeException;

class NoHandlerForCommand extends RuntimeException
{
    public static function for(string $commandClass): self
    {
        return new self("No handler registered for command [{$commandClass}].");
    }
}
