<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Authentication\ExchangeCodeStore;
use App\Authentication\ResolveSocialiteUser;
use App\Authorization\Roles\Role;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
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
        $locale = $this->pickLocale($request->query('locale'));
        $request->session()->put('vatsim_oauth_locale', $locale);

        Log::info('vatsim.oauth.redirect', ['intent' => 'frontend', 'locale' => $locale]);

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

        Log::info('vatsim.oauth.redirect', ['intent' => 'admin']);

        /** @var VatsimProvider $provider */
        $provider = Socialite::driver('vatsim');

        return $provider->scopes(['full_name', 'email'])->requiredScopes(['email'])->redirect();
    }

    public function callback(Request $request, ResolveSocialiteUser $resolver, ExchangeCodeStore $codes): RedirectResponse
    {
        $isAdminIntent = $request->session()->pull('vatsim_oauth_intent') === 'admin';
        $locale = $this->pickLocale($request->session()->pull('vatsim_oauth_locale'));

        Log::info('vatsim.oauth.callback', [
            'intent' => $isAdminIntent ? 'admin' : 'frontend',
            'locale' => $locale,
        ]);

        if ($isAdminIntent) {
            return $this->adminCallback($resolver, $locale);
        }

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
                $this->logIncompleteProfile('frontend', $cid, $email);

                return $this->toLoginError($locale);
            }

            $user = $resolver->resolve($cid, $email, $name);
            $token = $user->createToken('vatsim-login')->accessToken;

            $code = $codes->put($token, (int) config('socialite.exchange.ttl_seconds'));

            $callback = rtrim((string) config('app.frontend_url'), '/').'/api/auth/vatsim-callback';

            Log::info('vatsim.oauth.login', [
                'intent' => 'frontend',
                'cid' => $cid,
                'user_id' => $user->id,
            ]);

            return redirect()->away($callback.'?'.http_build_query(['code' => $code, 'locale' => $locale]));
        } catch (Throwable $e) {
            $this->logFailure('frontend', $e);

            return $this->toLoginError($locale);
        }
    }

    /**
     * Filament authenticates against the session `web` guard, not Passport,
     * so the admin path logs the user in directly instead of minting a
     * bearer token and handing it to the Next.js frontend. Panel access
     * itself is still gated by User::canAccessPanel() (the `admin` role) —
     * this only decides who gets a session at all.
     *
     * Every failure exit here leaves the panel origin entirely. VatsimLogin
     * answers /admin/login by redirecting straight back to the provider, so
     * a failure returned *to that page* re-enters the OAuth round trip and
     * never terminates — authorization failure routed back through the
     * authentication entry point. That was the admin ERR_TOO_MANY_REDIRECTS.
     */
    private function adminCallback(ResolveSocialiteUser $resolver, string $locale): RedirectResponse
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
                $this->logIncompleteProfile('admin', $cid, $email);

                return $this->toFrontendLogin($locale, 'oauth');
            }

            $user = $resolver->resolve($cid, $email, $name);

            // Authenticated but not authorised. ResolveSocialiteUser grants
            // every VATSIM member `member` and nothing grants `admin`, so this
            // is the ordinary outcome for anyone who is not already staff.
            if (! $user->hasRole(Role::Admin->value)) {
                // The roles are the whole point of this line: the common cause
                // is a member who has simply never been promoted, and without
                // seeing what the check actually found that is indistinguishable
                // from a broken role table or a guard mismatch.
                Log::warning('vatsim.oauth.admin_denied', [
                    'cid' => $cid,
                    'user_id' => $user->id,
                    'roles' => $user->getRoleNames()->all(),
                ]);

                return $this->toFrontendLogin($locale, 'forbidden');
            }

            Auth::guard('web')->login($user, remember: true);

            Log::info('vatsim.oauth.admin_login', ['cid' => $cid, 'user_id' => $user->id]);

            return redirect('/admin');
        } catch (Throwable $e) {
            $this->logFailure('admin', $e);

            return $this->toFrontendLogin($locale, 'oauth');
        }
    }

    /**
     * Both flows answer an incomplete profile with a bare `error=oauth`, which
     * on its own is indistinguishable from every other failure. Recording
     * which field was absent — rather than the values — is what separates
     * "VATSIM returned no email" from "the token exchange died".
     */
    private function logIncompleteProfile(string $intent, ?string $cid, ?string $email): void
    {
        Log::warning('vatsim.oauth.profile_incomplete', [
            'intent' => $intent,
            'has_cid' => $cid !== null,
            'has_email' => $email !== null,
        ]);
    }

    /**
     * report() alone routes to the configured log channel with a full stack
     * trace, which is worth keeping, but it does not say which of the two
     * flows was running or survive a channel that drops the trace. The
     * summary line is what a `docker logs | grep vatsim.oauth` finds.
     */
    private function logFailure(string $intent, Throwable $e): void
    {
        Log::error('vatsim.oauth.failed', [
            'intent' => $intent,
            'exception' => $e::class,
            'message' => $e->getMessage(),
        ]);

        report($e);
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
        return $this->toFrontendLogin($locale, 'oauth');
    }

    private function toFrontendLogin(string $locale, string $error): RedirectResponse
    {
        $frontend = rtrim((string) config('app.frontend_url'), '/');

        return redirect()->away(
            $frontend.'/'.$locale.'/login?'.http_build_query(['error' => $error]),
        );
    }

    private function pickLocale(mixed $value): string
    {
        return in_array($value, ['en', 'pt'], true) ? $value : 'en';
    }
}
