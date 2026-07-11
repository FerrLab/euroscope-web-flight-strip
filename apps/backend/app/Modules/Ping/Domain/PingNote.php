<?php

declare(strict_types=1);

namespace App\Modules\Ping\Domain;

use InvalidArgumentException;

/**
 * Translatable string value object — one map of locale-code => text.
 *
 * Pure-domain; no Laravel/Spatie imports. The Eloquent model in
 * Infrastructure converts to/from JSONB when persisting.
 */
final readonly class PingNote
{
    /** @param array<string, string> $translations */
    public function __construct(public array $translations)
    {
        if ($translations === []) {
            throw new InvalidArgumentException('PingNote requires at least one translation.');
        }
        foreach ($translations as $locale => $text) {
            if ($locale === '') {
                throw new InvalidArgumentException('PingNote locale keys must be non-empty strings.');
            }
            // @phpstan-ignore-next-line — runtime guard against unverified userland arrays
            if (! is_string($text)) {
                throw new InvalidArgumentException('PingNote values must be strings.');
            }
        }
    }

    public function forLocale(string $locale): string
    {
        return $this->translations[$locale] ?? array_values($this->translations)[0];
    }
}
