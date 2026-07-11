<?php

declare(strict_types=1);

namespace App\Authorization\Roles;

enum Role: string
{
    case Admin = 'admin';
    case Member = 'member';
}
