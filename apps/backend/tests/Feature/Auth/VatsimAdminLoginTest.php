<?php

declare(strict_types=1);

use App\Authorization\Roles\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Laravel\Passport\ClientRepository;
use Laravel\Socialite\Contracts\Provider;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\InvalidStateException;
use Laravel\Socialite\Two\User as SocialiteUser;
use Spatie\Permission\Models\Role as RoleModel;

uses(RefreshDatabase::class);

// Local to this file on purpose: Pest runs each test file in its own
// process under --parallel, so a helper declared in a sibling file is not
// reliably loaded here (and declaring the same name twice would fatal).
// Mirrors SocialiteProviders\Vatsim\Provider::mapUserToObject().
function fakeVatsimAdmin(?string $cid, ?string $email, ?string $fullName = 'Boss Example'): SocialiteUser
{
    $raw = [
        'data' => [
            'cid' => $cid,
            'personal' => [
                'name_first' => 'Boss',
                'name_last' => 'Example',
                'name_full' => $fullName,
                'email' => $email,
            ],
        ],
    ];

    return (new SocialiteUser)->setRaw($raw)->map([
        'id' => $cid,
        'name' => $fullName,
        'email' => $email,
    ]);
}

beforeEach(function (): void {
    app(ClientRepository::class)->createPersonalAccessGrantClient(
        name: 'Test Personal Access Client',
        provider: 'users',
    );

    RoleModel::firstOrCreate(['name' => Role::Admin->value, 'guard_name' => 'web']);
    RoleModel::firstOrCreate(['name' => Role::Member->value, 'guard_name' => 'web']);
});

it('sends the admin login page straight to VATSIM (happy)', function (): void {
    $fake = Mockery::mock(Provider::class);
    $fake->shouldReceive('scopes')->once()->andReturnSelf();
    $fake->shouldReceive('requiredScopes')->once()->andReturnSelf();
    $fake->shouldReceive('redirect')->once()->andReturn(redirect('https://auth.vatsim.net/oauth/authorize'));
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $this->get('/auth/socialite/vatsim/admin/redirect')
        ->assertRedirect('https://auth.vatsim.net/oauth/authorize');
});

it('logs an admin into the web guard and lands them on the panel (happy)', function (): void {
    $user = User::factory()->create(['email' => 'boss@vatsim.local', 'vatsim_cid' => '1234567']);
    $user->assignRole(Role::Admin->value);

    $fake = Mockery::mock(Provider::class);
    $fake->shouldReceive('user')->once()->andReturn(
        fakeVatsimAdmin('1234567', 'boss@vatsim.local'),
    );
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $response = $this->withSession(['vatsim_oauth_intent' => 'admin'])
        ->get('/auth/socialite/vatsim/callback');

    $response->assertRedirect('/admin');
    expect(Auth::guard('web')->id())->toBe($user->id);
});

it('refuses a VATSIM user without the admin role (invalid — panel stays shut)', function (): void {
    $fake = Mockery::mock(Provider::class);
    $fake->shouldReceive('user')->once()->andReturn(
        fakeVatsimAdmin('7654321', 'nobody@vatsim.local'),
    );
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $response = $this->withSession(['vatsim_oauth_intent' => 'admin'])
        ->get('/auth/socialite/vatsim/callback');

    $response->assertRedirect('/admin/login');
    expect(Auth::guard('web')->check())->toBeFalse();
});

it('does not mint a session for the ordinary frontend flow (invalid — intent is not admin)', function (): void {
    $fake = Mockery::mock(Provider::class);
    $fake->shouldReceive('user')->once()->andReturn(
        fakeVatsimAdmin('1234567', 'alice@vatsim.local'),
    );
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $response = $this->get('/auth/socialite/vatsim/callback');

    expect($response->headers->get('Location'))->toContain('/api/auth/vatsim-callback');
    expect(Auth::guard('web')->check())->toBeFalse();
});

it('forgets the admin intent after one callback (invalid — no stale intent)', function (): void {
    $user = User::factory()->create(['email' => 'boss@vatsim.local', 'vatsim_cid' => '1234567']);
    $user->assignRole(Role::Admin->value);

    $fake = Mockery::mock(Provider::class);
    $fake->shouldReceive('user')->twice()->andReturn(
        fakeVatsimAdmin('1234567', 'boss@vatsim.local'),
    );
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $this->withSession(['vatsim_oauth_intent' => 'admin'])
        ->get('/auth/socialite/vatsim/callback')
        ->assertRedirect('/admin');

    // Second trip with no intent set must fall back to the frontend flow.
    $second = $this->get('/auth/socialite/vatsim/callback');
    expect($second->headers->get('Location'))->toContain('/api/auth/vatsim-callback');
});

it('redirects to the panel login when the provider throws (garbage)', function (): void {
    $fake = Mockery::mock(Provider::class);
    $fake->shouldReceive('user')->once()->andThrow(new InvalidStateException);
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $this->withSession(['vatsim_oauth_intent' => 'admin'])
        ->get('/auth/socialite/vatsim/callback')
        ->assertRedirect('/admin/login');
});
