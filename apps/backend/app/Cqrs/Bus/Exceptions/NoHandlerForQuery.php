<?php

declare(strict_types=1);

namespace App\Cqrs\Bus\Exceptions;

use RuntimeException;

class NoHandlerForQuery extends RuntimeException
{
    public static function for(string $queryClass): self
    {
        return new self("No handler registered for query [{$queryClass}].");
    }
}
