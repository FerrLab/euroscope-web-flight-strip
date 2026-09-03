<?php

declare(strict_types=1);

use Laravel\Socialite\Facades\Socialite;
use SocialiteProviders\Vatsim\Provider;

it('resolves the vatsim driver to the SocialiteProviders Vatsim provider (happy)', function (): void {
    config([
        'services.vatsim.client_id' => 'test-client-id',
        'services.vatsim.client_secret' => 'test-client-secret',
        'services.vatsim.redirect' => 'http://localhost:8000/auth/socialite/vatsim/callback',
    ]);

    expect(Socialite::driver('vatsim'))->toBeInstanceOf(Provider::class);
});
