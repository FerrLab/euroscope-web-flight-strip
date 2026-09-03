<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Socialite exchange code
    |--------------------------------------------------------------------------
    |
    | After a Socialite callback mints a Passport token, the token crosses
    | to the browser as a single-use code stored here rather than as a URL
    | parameter — see docs/superpowers/specs/2026-09-03-vatsim-oauth-design.md.
    | Tests override key_prefix per-process so parallel Pest workers sharing
    | one Dragonfly instance never collide (mirrors config/gateway.php).
    |
    */

    'exchange' => [
        'key_prefix' => env('SOCIALITE_EXCHANGE_KEY_PREFIX', 'socialite:exchange'),
        'ttl_seconds' => (int) env('SOCIALITE_EXCHANGE_TTL_SECONDS', 60),
    ],

];
