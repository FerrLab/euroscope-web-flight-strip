<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Domain;

final class ConsoleBatch
{
    /**
     * @param  array<int, array{id: string, direction: string, envelope: string}>  $messages
     * @param  ?string  $cursor  Stream ID of the newest returned entry; callers resume from here.
     * @param  bool  $reset  True when the caller's cursor predates the ring buffer — replace, don't append.
     */
    public function __construct(
        public readonly array $messages,
        public readonly ?string $cursor,
        public readonly bool $reset,
    ) {}
}
