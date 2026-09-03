<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Authentication\ResolveSocialiteUser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Socialite\Facades\Socialite;
use Symfony\Component\HttpFoundation\RedirectResponse as SymfonyRedirectResponse;

class SocialiteStubController
{
    public function redirect(Request $request): SymfonyRedirectResponse
    {
        return Socialite::driver('stub')->redirect();
    }

    public function callback(Request $request, ResolveSocialiteUser $resolver): JsonResponse
    {
        $stubUser = Socialite::driver('stub')->user();

        $user = $resolver->resolve(null, (string) $stubUser->getEmail(), (string) $stubUser->getName());

        $token = $user->createToken('stub-login')->accessToken;

        return response()->json([
            'access_token' => $token,
            'token_type' => 'Bearer',
            'user' => ['id' => $user->id, 'email' => $user->email],
        ]);
    }
}
