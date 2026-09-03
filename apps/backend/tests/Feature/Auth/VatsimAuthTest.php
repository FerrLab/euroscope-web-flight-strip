<?php

declare(strict_types=1);

use App\Authentication\ExchangeCodeStore;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Passport\ClientRepository;
use Laravel\Socialite\Contracts\Provider;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\InvalidStateException;
use Laravel\Socialite\Two\User as SocialiteUser;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    // RefreshDatabase truncates oauth_clients between tests, so we seed a
    // fresh personal-access client per test (mirrors every other test file
    // in this suite that calls User::createToken()).
    app(ClientRepository::class)->createPersonalAccessGrantClient(
        name: 'Test Personal Access Client',
        provider: 'users',
    );
});

function fakeVatsimUser(?string $cid, ?string $email, ?string $fullName = 'Alice Example'): SocialiteUser
{
    $raw = [
        'data' => [
            'cid' => $cid,
            'personal' => [
                'name_first' => 'Alice',
                'name_last' => 'Example',
                'name_full' => $fullName,
                'email' => $email,
            ],
        ],
    ];

    return (new SocialiteUser)->setRaw($raw)->map([
        'cid' => $cid,
        'full_name' => $fullName,
    ]);
}

it('redirects to the provider (happy)', function (): void {
    $fake = Mockery::mock(Provider::class);
    // Contracts\Provider only declares redirect()/user() — scopes() lives on
    // the concrete AbstractProvider, so the interface mock needs an explicit
    // expectation for it before it can answer the controller's ->scopes()->redirect() chain.
    $fake->shouldReceive('scopes')->once()->with(['full_name', 'email'])->andReturnSelf();
    $fake->shouldReceive('redirect')->once()->andReturn(redirect('https://auth.vatsim.net/oauth/authorize'));
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $response = $this->get('/auth/socialite/vatsim/redirect');

    $response->assertRedirect('https://auth.vatsim.net/oauth/authorize');
});

it('creates a user, mints a token, and redirects with an exchange code (happy)', function (): void {
    $fake = Mockery::mock(Provider::class);
    $fake->shouldReceive('user')->once()->andReturn(fakeVatsimUser('1234567', 'alice@vatsim.local'));
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $response = $this->get('/auth/socialite/vatsim/callback?locale=en');

    $response->assertRedirect();
    $location = $response->headers->get('Location');
    expect($location)->toContain('/api/auth/vatsim-callback');
    expect($location)->toContain('locale=en');
    parse_str((string) parse_url((string) $location, PHP_URL_QUERY), $query);
    expect($query['code'])->toBeString()->not->toBeEmpty();

    $this->assertDatabaseHas('users', ['email' => 'alice@vatsim.local', 'vatsim_cid' => '1234567']);
});

it('the exchange code redeems to a working Bearer token (happy — end to end)', function (): void {
    $fake = Mockery::mock(Provider::class);
    $fake->shouldReceive('user')->once()->andReturn(fakeVatsimUser('1234567', 'alice@vatsim.local'));
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $response = $this->get('/auth/socialite/vatsim/callback?locale=en');
    parse_str((string) parse_url((string) $response->headers->get('Location'), PHP_URL_QUERY), $query);

    $exchanged = app(ExchangeCodeStore::class)->redeem($query['code']);
    expect($exchanged)->toBeString();

    $user = User::query()->where('email', 'alice@vatsim.local')->firstOrFail();
    $me = $this->withToken($exchanged)->getJson('/api/user');
    $me->assertOk();
    expect($me->json('id'))->toBe($user->id);
});

it('redirects to login with an error when the profile has no email (invalid)', function (): void {
    $fake = Mockery::mock(Provider::class);
    $fake->shouldReceive('user')->once()->andReturn(fakeVatsimUser('1234567', null));
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $response = $this->get('/auth/socialite/vatsim/callback?locale=en');

    $response->assertRedirect();
    expect($response->headers->get('Location'))->toContain('/en/login?error=oauth');
    $this->assertDatabaseCount('users', 0);
});

it('redirects to login with an error when the profile has no CID (invalid)', function (): void {
    $fake = Mockery::mock(Provider::class);
    $fake->shouldReceive('user')->once()->andReturn(fakeVatsimUser(null, 'alice@vatsim.local'));
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $response = $this->get('/auth/socialite/vatsim/callback?locale=en');

    expect($response->headers->get('Location'))->toContain('/en/login?error=oauth');
    $this->assertDatabaseCount('users', 0);
});

it('redirects to login with an error when the provider throws (garbage — denied consent / state mismatch)', function (): void {
    $fake = Mockery::mock(Provider::class);
    $fake->shouldReceive('user')->once()->andThrow(new InvalidStateException);
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $response = $this->get('/auth/socialite/vatsim/callback?locale=en');

    expect($response->headers->get('Location'))->toContain('/en/login?error=oauth');
});

it('falls back to English when locale is missing (garbage)', function (): void {
    $fake = Mockery::mock(Provider::class);
    $fake->shouldReceive('user')->once()->andThrow(new InvalidStateException);
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $response = $this->get('/auth/socialite/vatsim/callback');

    expect($response->headers->get('Location'))->toContain('/en/login?error=oauth');
});
