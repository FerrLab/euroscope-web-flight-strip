<?php

declare(strict_types=1);

namespace App\Modules\Ping\Application\Queries;

use App\Cqrs\Query;
use App\Modules\Ping\Domain\PingPermission;
use Spatie\LaravelData\Data;

class ListPingsQuery extends Data implements Query
{
    public function __construct(
        public int $userId,
        public int $limit = 50,
    ) {}

    public function permission(): PingPermission
    {
        return PingPermission::View;
    }
}
