<?php

declare(strict_types=1);

use App\Models\User;
use App\Modules\Gateway\Infrastructure\PassportGatewayTokenRepository;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Passport\ClientRepository;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    // RefreshDatabase truncates oauth_clients between tests, so we seed a
    // fresh personal-access client per test (same as PingControllerTest).
    app(ClientRepository::class)->createPersonalAccessGrantClient(
        name: 'Test Personal Access Client',
        provider: 'users',
    );
});

it('mints a personal access token named gateway (happy)', function (): void {
    $user = User::factory()->create();
    $repo = new PassportGatewayTokenRepository;

    $token = $repo->rotate($user->id);

    expect($token->plainText)->toBeString()->not->toBe('');
    expect($token->createdAt)->toBeInstanceOf(DateTimeImmutable::class);
    expect($user->tokens()->where('name', 'gateway')->where('revoked', false)->count())->toBe(1);
});

it('revokes the previous gateway token on rotate (happy)', function (): void {
    $user = User::factory()->create();
    $repo = new PassportGatewayTokenRepository;

    $first = $repo->rotate($user->id);
    $second = $repo->rotate($user->id);

    expect($second->plainText)->not->toBe($first->plainText);
    expect($user->tokens()->where('name', 'gateway')->where('revoked', false)->count())->toBe(1);
    expect($user->tokens()->where('name', 'gateway')->where('revoked', true)->count())->toBe(1);
});

it('leaves non-gateway tokens untouched (happy)', function (): void {
    $user = User::factory()->create();
    $user->createToken('stub-login');

    (new PassportGatewayTokenRepository)->rotate($user->id);

    expect($user->tokens()->where('name', 'stub-login')->where('revoked', false)->count())->toBe(1);
});

it('reports null status before any token exists (invalid)', function (): void {
    $user = User::factory()->create();

    expect((new PassportGatewayTokenRepository)->activeTokenCreatedAt($user->id))->toBeNull();
});

it('reports the active token creation time after rotate (happy)', function (): void {
    $user = User::factory()->create();
    $repo = new PassportGatewayTokenRepository;

    $token = $repo->rotate($user->id);

    expect($repo->activeTokenCreatedAt($user->id)?->format(DATE_ATOM))
        ->toBe($token->createdAt->format(DATE_ATOM));
});

it('throws for an unknown user (garbage)', function (): void {
    expect(fn () => (new PassportGatewayTokenRepository)->rotate(999_999))
        ->toThrow(ModelNotFoundException::class);
});
