<?php

declare(strict_types=1);

use App\Authorization\Roles\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Event;
use Laravel\Passport\ClientRepository;
use Laravel\Socialite\Contracts\Provider;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\InvalidStateException;
use Laravel\Socialite\Two\User as SocialiteUser;
use Spatie\Permission\Models\Role as RoleModel;

uses(RefreshDatabase::class);

// Local to this file: Pest runs each test file in its own process under
// --parallel, so a helper declared in a sibling file is not reliably loaded
// here (and declaring the same name twice would fatal).
function fakeVatsimForLogging(?string $cid, ?string $email): SocialiteUser
{
    return (new SocialiteUser)
        ->setRaw(['data' => ['cid' => $cid, 'personal' => ['email' => $email]]])
        ->map(['id' => $cid, 'name' => 'Logged Example', 'email' => $email]);
}

/**
 * Listening for MessageLogged exercises the real logger rather than a facade
 * spy, so what these tests assert on is what a deployment would actually see
 * in `docker logs`.
 *
 * @return list<MessageLogged>
 */
function captureLogs(Closure $act): array
{
    /** @var list<MessageLogged> $logged */
    $logged = [];

    Event::listen(MessageLogged::class, function (MessageLogged $event) use (&$logged): void {
        $logged[] = $event;
    });

    $act();

    return $logged;
}

/**
 * Throws rather than returning null: it keeps the return type non-nullable
 * (PHPStan cannot narrow through a Pest expectation) and turns a missing
 * event into a failure that names what *was* logged, which is far more use
 * than "property on null".
 *
 * @param  list<MessageLogged>  $logged
 */
function requireLog(array $logged, string $event): MessageLogged
{
    foreach ($logged as $entry) {
        if ($entry->message === $event) {
            return $entry;
        }
    }

    $seen = implode(', ', array_map(static fn (MessageLogged $e): string => $e->message, $logged));

    throw new RuntimeException("No log event [{$event}]. Logged: [{$seen}]");
}

function provideVatsimUser(SocialiteUser $user): void
{
    $fake = Mockery::mock(Provider::class);
    $fake->shouldReceive('user')->once()->andReturn($user);
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);
}

beforeEach(function (): void {
    app(ClientRepository::class)->createPersonalAccessGrantClient(
        name: 'Test Personal Access Client',
        provider: 'users',
    );

    RoleModel::firstOrCreate(['name' => Role::Admin->value, 'guard_name' => 'web']);
    RoleModel::firstOrCreate(['name' => Role::Member->value, 'guard_name' => 'web']);
});

it('records the intent the callback is serving (happy)', function (): void {
    provideVatsimUser(fakeVatsimForLogging('1234567', 'alice@vatsim.local'));

    $logged = captureLogs(fn () => $this->get('/auth/socialite/vatsim/callback'));

    $entry = requireLog($logged, 'vatsim.oauth.callback');
    expect($entry->level)->toBe('info');
    expect($entry->context['intent'])->toBe('frontend');
});

it('names the missing field when a profile is incomplete (invalid — the silent exit)', function (): void {
    provideVatsimUser(fakeVatsimForLogging('1234567', null));

    $logged = captureLogs(fn () => $this->get('/auth/socialite/vatsim/callback'));

    $entry = requireLog($logged, 'vatsim.oauth.profile_incomplete');
    expect($entry->level)->toBe('warning');
    expect($entry->context['has_cid'])->toBeTrue();
    expect($entry->context['has_email'])->toBeFalse();
});

it('records why an admin was turned away, with the roles it saw (invalid)', function (): void {
    provideVatsimUser(fakeVatsimForLogging('7654321', 'nobody@vatsim.local'));

    $logged = captureLogs(fn () => $this->withSession(['vatsim_oauth_intent' => 'admin'])
        ->get('/auth/socialite/vatsim/callback'));

    $entry = requireLog($logged, 'vatsim.oauth.admin_denied');
    expect($entry->level)->toBe('warning');
    expect($entry->context['cid'])->toBe('7654321');
    expect($entry->context['roles'])->toBe(['member']);
});

it('records a successful admin sign-in (happy)', function (): void {
    $user = User::factory()->create(['email' => 'boss@vatsim.local', 'vatsim_cid' => '1234567']);
    $user->assignRole(Role::Admin->value);

    provideVatsimUser(fakeVatsimForLogging('1234567', 'boss@vatsim.local'));

    $logged = captureLogs(fn () => $this->withSession(['vatsim_oauth_intent' => 'admin'])
        ->get('/auth/socialite/vatsim/callback'));

    $entry = requireLog($logged, 'vatsim.oauth.admin_login');
    expect($entry->context['cid'])->toBe('1234567');
    expect($entry->context['user_id'])->toBe($user->id);
});

it('names the exception class when the round trip throws (garbage)', function (): void {
    $fake = Mockery::mock(Provider::class);
    $fake->shouldReceive('user')->once()->andThrow(new InvalidStateException('state mismatch'));
    Socialite::shouldReceive('driver')->with('vatsim')->andReturn($fake);

    $logged = captureLogs(fn () => $this->withSession(['vatsim_oauth_intent' => 'admin'])
        ->get('/auth/socialite/vatsim/callback'));

    $entry = requireLog($logged, 'vatsim.oauth.failed');
    expect($entry->level)->toBe('error');
    expect($entry->context['intent'])->toBe('admin');
    expect($entry->context['exception'])->toBe(InvalidStateException::class);
    expect($entry->context['message'])->toBe('state mismatch');
});

it('never writes the member email into a log context (invalid — PII stays out)', function (): void {
    provideVatsimUser(fakeVatsimForLogging('7654321', 'private@vatsim.local'));

    $logged = captureLogs(fn () => $this->withSession(['vatsim_oauth_intent' => 'admin'])
        ->get('/auth/socialite/vatsim/callback'));

    foreach ($logged as $entry) {
        expect(json_encode($entry->context, JSON_THROW_ON_ERROR))
            ->not->toContain('private@vatsim.local');
    }
});
