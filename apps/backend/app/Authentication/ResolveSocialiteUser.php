<?php

declare(strict_types=1);

namespace App\Authentication;

use App\Authentication\Exceptions\ConflictingSocialiteIdentity;
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
 *  2. Else match on email and adopt the row (set its CID, if any) — unless
 *     that row already carries a *different* CID, which is refused with a
 *     ConflictingSocialiteIdentity rather than silently handing back another
 *     member's account.
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

            if ($user !== null && $cid !== null) {
                if ($user->vatsim_cid === null) {
                    $user->vatsim_cid = $cid;
                    $user->save();
                } elseif ($user->vatsim_cid !== $cid) {
                    // The email belongs to a row already linked to a different
                    // VATSIM member. Returning it would mint a Bearer for the
                    // wrong account, so refuse rather than adopt.
                    throw new ConflictingSocialiteIdentity(
                        "Email {$email} already belongs to a different VATSIM CID.",
                    );
                }
            }
        }

        if ($user === null) {
            $user = User::create([
                'name' => $name,
                'email' => $email,
                'vatsim_cid' => $cid,
                // The User model's 'password' => 'hashed' cast hashes this on
                // the way in; bcrypt()-ing it here too would double-hash.
                'password' => Str::random(32),
            ]);
        }

        $member = RoleModel::where('name', Role::Member->value)->where('guard_name', 'web')->first();
        if ($member !== null && ! $user->hasRole($member)) {
            $user->assignRole($member);
        }

        return $user;
    }
}
