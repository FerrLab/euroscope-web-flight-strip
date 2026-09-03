<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Authentication\ExchangeCodeStore;
use App\Authentication\ResolveSocialiteUser;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\AbstractProvider;
use Laravel\Socialite\Two\User as SocialiteUser;
use Symfony\Component\HttpFoundation\RedirectResponse as SymfonyRedirectResponse;
use Throwable;

class VatsimAuthController
{
    public function redirect(Request $request): SymfonyRedirectResponse
    {
        /** @var AbstractProvider $provider */
        $provider = Socialite::driver('vatsim');

        return $provider->scopes(['full_name', 'email'])->redirect();
    }

    public function callback(Request $request, ResolveSocialiteUser $resolver, ExchangeCodeStore $codes): RedirectResponse
    {
        $locale = $this->pickLocale($request->query('locale'));

        try {
            /** @var AbstractProvider $provider */
            $provider = Socialite::driver('vatsim');
            /** @var SocialiteUser $vatsimUser */
            $vatsimUser = $provider->user();
        } catch (Throwable) {
            return $this->toLoginError($locale);
        }

        $cid = $this->stringOrNull($vatsimUser->cid);
        $email = $this->emailFromRaw($vatsimUser);
        $name = $this->stringOrNull($vatsimUser->full_name) ?? 'VATSIM Member';

        if ($cid === null || $email === null) {
            return $this->toLoginError($locale);
        }

        $user = $resolver->resolve($cid, $email, $name);
        $token = $user->createToken('vatsim-login')->accessToken;

        $code = $codes->put($token, (int) config('socialite.exchange.ttl_seconds'));

        $callback = rtrim((string) config('app.frontend_url'), '/').'/api/auth/vatsim-callback';

        return redirect()->away($callback.'?'.http_build_query(['code' => $code, 'locale' => $locale]));
    }

    /**
     * The library maps name_first/name_last/name_full from data.personal.*
     * but does not map email itself — read it from the same raw branch.
     */
    private function emailFromRaw(SocialiteUser $user): ?string
    {
        return $this->stringOrNull(Arr::get($user->getRaw(), 'data.personal.email'));
    }

    private function stringOrNull(mixed $value): ?string
    {
        if (! is_string($value) || $value === '') {
            return null;
        }

        return $value;
    }

    private function toLoginError(string $locale): RedirectResponse
    {
        $frontend = rtrim((string) config('app.frontend_url'), '/');

        return redirect()->away($frontend.'/'.$locale.'/login?error=oauth');
    }

    private function pickLocale(mixed $value): string
    {
        return in_array($value, ['en', 'pt'], true) ? $value : 'en';
    }
}
