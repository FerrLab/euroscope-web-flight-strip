<?php

declare(strict_types=1);

namespace App\Cqrs\Bus;

class HandlerRegistry
{
    /** @var array<class-string, class-string> */
    private array $map = [];

    /**
     * @param  class-string  $messageClass
     * @param  class-string  $handlerClass
     */
    public function register(string $messageClass, string $handlerClass): void
    {
        $this->map[$messageClass] = $handlerClass;
    }

    /**
     * @return class-string|null
     */
    public function handlerFor(string $messageClass): ?string
    {
        return $this->map[$messageClass] ?? null;
    }
}
