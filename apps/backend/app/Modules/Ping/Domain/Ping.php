<?php

declare(strict_types=1);

namespace App\Modules\Ping\Domain;

use DateTimeImmutable;
use InvalidArgumentException;

final readonly class Ping
{
    public function __construct(
        public string $id,
        public int $userId,
        public PingNote $note,
        public DateTimeImmutable $createdAt,
    ) {
        if ($id === '') {
            throw new InvalidArgumentException('Ping id cannot be empty.');
        }
        if ($userId < 1) {
            throw new InvalidArgumentException('Ping userId must be a positive integer.');
        }
    }
}
