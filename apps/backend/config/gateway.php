<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Redis key prefix
    |--------------------------------------------------------------------------
    |
    | All gateway runtime keys (message stream, command queue, presence) are
    | namespaced under this prefix. Tests override it per-process so parallel
    | Pest workers sharing one Dragonfly never collide.
    |
    */

    'key_prefix' => env('GATEWAY_KEY_PREFIX', 'gateway'),

];
