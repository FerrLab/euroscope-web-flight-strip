<?php

declare(strict_types=1);

namespace App\Authentication;

use App\Authorization\Roles\Role;
use App\Models\User;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role as RoleModel;

/**
 * Identity resolution shared by every Socialite callback (VATSIM and the
 * non-production stub) so both mint sessions with identical semantics —
 * see docs/superpowers/specs/2026-09-03-vatsim-oauth-design.md.
 *
 * Resolution order:
 *  1. Match on vatsim_cid, when one is supplied — the stable identity.
 *  2. Else match on email and adopt the row (set its CID, if any).
 *  3. Else create.
 *
 * First login for a brand-new user assigns the `member` role. There is no
 * rating gate or allowlist — any VATSIM account may sign in.
 */
final class ResolveSocialiteUser
{
    public function resolve(?string $cid, string $email, string $name): User
    {
        $user = $cid !== null
            ? User::query()->where('vatsim_cid', $cid)->first()
            : null;

        if ($user === null) {
            $user = User::query()->where('email', $email)->first();

            if ($user !== null && $cid !== null && $user->vatsim_cid === null) {
                $user->vatsim_cid = $cid;
                $user->save();
            }
        }

        if ($user === null) {
            $user = User::create([
                'name' => $name,
                'email' => $email,
                'vatsim_cid' => $cid,
                'password' => bcrypt(Str::random(32)),
            ]);
        }

        $member = RoleModel::where('name', Role::Member->value)->where('guard_name', 'web')->first();
        if ($member !== null && ! $user->hasRole($member)) {
            $user->assignRole($member);
        }

        return $user;
    }
}
