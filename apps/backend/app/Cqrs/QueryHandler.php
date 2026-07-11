<?php

declare(strict_types=1);

namespace App\Cqrs;

interface QueryHandler
{
    public function handle(Query $query): mixed;
}
