<?php

declare(strict_types=1);

namespace App\Authentication\Socialite;

use Laravel\Socialite\Two\AbstractProvider;
use Laravel\Socialite\Two\ProviderInterface;
use Laravel\Socialite\Two\User as SocialiteUser;

/**
 * Stub Socialite driver — decision #7 (per-request fixture identity).
 *
 * Accepts ?identity=<email> query param; defaults to stub-user@eurostrip.local.
 * The "OAuth flow" is a no-op redirect (back to callback) and a deterministic
 * user payload. Used for dev and integration tests without a real IdP.
 */
class StubProvider extends AbstractProvider implements ProviderInterface
{
    /** @var list<string> */
    protected $scopes = [];

    private const DEFAULT_IDENTITY = 'stub-user@eurostrip.local';

    protected function getAuthUrl($state): string
    {
        return route('auth.socialite.stub.callback', [
            'identity' => request()->query('identity', self::DEFAULT_IDENTITY),
        ]);
    }

    protected function getTokenUrl(): string
    {
        return 'http://stub.invalid/token'; // never called
    }

    public function user(): SocialiteUser
    {
        $email = (string) request()->query('identity', self::DEFAULT_IDENTITY);

        return tap(new SocialiteUser, function (SocialiteUser $u) use ($email): void {
            $u->id = $email;
            $u->email = $email;
            $u->name = explode('@', $email)[0];
            $u->setToken('stub-access-token');
            $u->setRefreshToken('stub-refresh-token');
            $u->setExpiresIn(3600);
        });
    }

    /**
     * @return array<string, mixed>
     */
    protected function getUserByToken($token): array
    {
        return [];
    }

    /**
     * @param  array<string, mixed>  $user
     */
    protected function mapUserToObject(array $user): SocialiteUser
    {
        return $this->user();
    }
}
