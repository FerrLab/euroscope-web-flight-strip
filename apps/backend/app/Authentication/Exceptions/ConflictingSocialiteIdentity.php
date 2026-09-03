<?php

declare(strict_types=1);

namespace App\Authentication\Exceptions;

use RuntimeException;

/**
 * Raised when an incoming Socialite identity's email already belongs to a row
 * carrying a different, non-null VATSIM CID. Adopting that row would hand the
 * caller another member's account, so the login is refused outright.
 */
final class ConflictingSocialiteIdentity extends RuntimeException {}
