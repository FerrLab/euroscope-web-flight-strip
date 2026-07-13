<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Domain;

enum Direction: string
{
    case In = 'in';
    case Out = 'out';
}
