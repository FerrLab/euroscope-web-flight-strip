<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Socialite\Facades\Socialite;
use Spatie\Permission\Models\Role;
use Symfony\Component\HttpFoundation\RedirectResponse as SymfonyRedirectResponse;

class SocialiteStubController
{
    public function redirect(Request $request): SymfonyRedirectResponse
    {
        return Socialite::driver('stub')->redirect();
    }

    public function callback(Request $request): JsonResponse
    {
        $stubUser = Socialite::driver('stub')->user();

        $user = User::firstOrCreate(
            ['email' => $stubUser->getEmail()],
            ['name' => $stubUser->getName(), 'password' => bcrypt(str()->random(32))],
        );

        // Stub login is a dev-only convenience — auto-assign the seeded
        // `member` role so freshly created identities can authorize endpoints.
        // Production OAuth flow has its own provisioning rules.
        $member = Role::where('name', 'member')->where('guard_name', 'web')->first();
        if ($member !== null && ! $user->hasRole($member)) {
            $user->assignRole($member);
        }

        $token = $user->createToken('stub-login')->accessToken;

        return response()->json([
            'access_token' => $token,
            'token_type' => 'Bearer',
            'user' => ['id' => $user->id, 'email' => $user->email],
        ]);
    }
}
