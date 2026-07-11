<?php

declare(strict_types=1);

namespace App\Authorization\Contracts;

use BackedEnum;

/**
 * Marker interface for module permission enums.
 *
 * Every module declares its permissions as a string-backed PHP enum
 * that implements this interface. Authorization helpers, the seeder,
 * and the custom PHPStan rule (Task 23) rely on this marker.
 *
 * Example:
 *
 *     enum PingPermission: string implements Permission
 *     {
 *         case View   = 'ping.view';
 *         case Create = 'ping.create';
 *     }
 *
 * The interface extends BackedEnum to guarantee `->value` is a string
 * and that cases() is callable for the seeder reconciliation.
 */
interface Permission extends BackedEnum {}
