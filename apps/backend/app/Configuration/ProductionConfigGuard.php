<?php

declare(strict_types=1);

namespace App\Configuration;

use Illuminate\Support\Facades\Log;

/**
 * Settings that have a local-dev default which is actively wrong in
 * production. Left unset on a real deployment they fail quietly and
 * confusingly: an unset FRONTEND_URL, for instance, sends users through a
 * successful VATSIM login and then redirects their browser to
 * http://localhost:3000, which only fails once it reaches them.
 *
 * This does not throw — a misconfigured value should not take the whole
 * deployment down — it just makes the cause findable in the logs instead
 * of leaving someone to infer it from a bad redirect.
 */
final class ProductionConfigGuard
{
    /**
     * @return list<string>
     */
    public static function problems(): array
    {
        $problems = [];

        foreach ([
            'FRONTEND_URL' => 'app.frontend_url',
            'VATSIM_CLIENT_ID' => 'services.vatsim.client_id',
            'VATSIM_CLIENT_SECRET' => 'services.vatsim.client_secret',
            'VATSIM_REDIRECT_URI' => 'services.vatsim.redirect',
        ] as $envName => $configKey) {
            $value = config($configKey);
            $value = is_string($value) ? trim($value) : $value;

            if (! is_string($value) || $value === '') {
                $problems[] = "{$envName} is not set";

                continue;
            }

            if (str_contains($value, 'localhost') || str_contains($value, '127.0.0.1')) {
                $problems[] = "{$envName} still points at localhost";
            }
        }

        return $problems;
    }

    public static function report(): void
    {
        if (! app()->isProduction()) {
            return;
        }

        $problems = self::problems();

        if ($problems === []) {
            return;
        }

        Log::critical(
            'EuroStrip is misconfigured for production; these settings still hold their local-dev defaults.',
            ['problems' => $problems],
        );
    }
}
