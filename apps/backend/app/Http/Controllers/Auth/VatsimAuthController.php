<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Authentication\ExchangeCodeStore;
use App\Authentication\ResolveSocialiteUser;
use App\Authorization\Roles\Role;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\AbstractProvider;
use Laravel\Socialite\Two\User as SocialiteUser;
use SocialiteProviders\Vatsim\Provider as VatsimProvider;
use Symfony\Component\HttpFoundation\RedirectResponse as SymfonyRedirectResponse;
use Throwable;

class VatsimAuthController
{
    public function redirect(Request $request): SymfonyRedirectResponse
    {
        // VATSIM's redirect back to callback() carries only `code` and `state`
        // (standard OAuth2 — there is no app-specific parameter to echo back),
        // so the caller's locale has to survive the round trip in the session.
        $request->session()->put('vatsim_oauth_locale', $this->pickLocale($request->query('locale')));

        /** @var VatsimProvider $provider */
        $provider = Socialite::driver('vatsim');

        // requiredScopes() appends `required_scopes` to the authorization URL,
        // which VATSIM Connect enforces at consent time — a member cannot
        // decline `email` and still complete the flow, so callback() can rely
        // on it being present instead of failing silently afterwards.
        return $provider->scopes(['full_name', 'email'])->requiredScopes(['email'])->redirect();
    }

    /**
     * VATSIM only ever redirects back to the single registered
     * VATSIM_REDIRECT_URI, so the admin panel cannot have a callback URL of
     * its own — it flags its intent in the session on the way out and
     * callback() branches on it coming back in.
     */
    public function adminRedirect(Request $request): SymfonyRedirectResponse
    {
        $request->session()->put('vatsim_oauth_intent', 'admin');

        /** @var VatsimProvider $provider */
        $provider = Socialite::driver('vatsim');

        return $provider->scopes(['full_name', 'email'])->requiredScopes(['email'])->redirect();
    }

    public function callback(Request $request, ResolveSocialiteUser $resolver, ExchangeCodeStore $codes): RedirectResponse
    {
        if ($request->session()->pull('vatsim_oauth_intent') === 'admin') {
            return $this->adminCallback($resolver);
        }

        $locale = $this->pickLocale($request->session()->pull('vatsim_oauth_locale'));

        // The whole body is guarded: the spec's contract is that ANY failure —
        // denied consent, state mismatch, a conflicting identity, a failed
        // token mint — degrades to /{locale}/login?error=oauth, never a 500 and
        // never a partial session.
        try {
            /** @var AbstractProvider $provider */
            $provider = Socialite::driver('vatsim');
            /** @var SocialiteUser $vatsimUser */
            $vatsimUser = $provider->user();

            // SocialiteProviders\Vatsim\Provider::mapUserToObject() maps exactly
            // id/name/email (from data.cid, data.personal.name_full and
            // data.personal.email). They are reachable only through these
            // interface methods — never as magic `cid`/`full_name` properties,
            // which AbstractUser::__get() resolves to null.
            $cid = $this->stringOrNull($vatsimUser->getId());
            $email = $this->stringOrNull($vatsimUser->getEmail());
            $name = $this->stringOrNull($vatsimUser->getName()) ?? 'VATSIM Member';

            if ($cid === null || $email === null) {
                return $this->toLoginError($locale);
            }

            $user = $resolver->resolve($cid, $email, $name);
            $token = $user->createToken('vatsim-login')->accessToken;

            $code = $codes->put($token, (int) config('socialite.exchange.ttl_seconds'));

            $callback = rtrim((string) config('app.frontend_url'), '/').'/api/auth/vatsim-callback';

            return redirect()->away($callback.'?'.http_build_query(['code' => $code, 'locale' => $locale]));
        } catch (Throwable $e) {
            report($e);

            return $this->toLoginError($locale);
        }
    }

    /**
     * Filament authenticates against the session `web` guard, not Passport,
     * so the admin path logs the user in directly instead of minting a
     * bearer token and handing it to the Next.js frontend. Panel access
     * itself is still gated by User::canAccessPanel() (the `admin` role) —
     * this only decides who gets a session at all.
     */
    private function adminCallback(ResolveSocialiteUser $resolver): RedirectResponse
    {
        try {
            /** @var VatsimProvider $provider */
            $provider = Socialite::driver('vatsim');
            /** @var SocialiteUser $vatsimUser */
            $vatsimUser = $provider->user();

            $cid = $this->stringOrNull($vatsimUser->getId());
            $email = $this->stringOrNull($vatsimUser->getEmail());
            $name = $this->stringOrNull($vatsimUser->getName()) ?? 'VATSIM Member';

            if ($cid === null || $email === null) {
                return redirect('/admin/login');
            }

            $user = $resolver->resolve($cid, $email, $name);

            if (! $user->hasRole(Role::Admin->value)) {
                return redirect('/admin/login');
            }

            Auth::guard('web')->login($user, remember: true);

            return redirect('/admin');
        } catch (Throwable $e) {
            report($e);

            return redirect('/admin/login');
        }
    }

    /** VATSIM's /api/user may serialise `cid` as a JSON number; accept both shapes. */
    private function stringOrNull(mixed $value): ?string
    {
        if (is_int($value)) {
            $value = (string) $value;
        }

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
