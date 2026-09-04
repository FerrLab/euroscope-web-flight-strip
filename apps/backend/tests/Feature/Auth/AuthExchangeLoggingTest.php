<?php

declare(strict_types=1);

use App\Authentication\ExchangeCodeStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

/**
 * @return list<MessageLogged>
 */
function captureExchangeLogs(Closure $act): array
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
 * @param  list<MessageLogged>  $logged
 */
function hasExchangeLog(array $logged, string $event): bool
{
    foreach ($logged as $entry) {
        if ($entry->message === $event) {
            return true;
        }
    }

    return false;
}

it('records a redeemed exchange code (happy)', function (): void {
    $code = app(ExchangeCodeStore::class)->put('a-token', 60);

    $logged = captureExchangeLogs(fn () => $this->postJson('/auth/socialite/exchange', ['code' => $code])
        ->assertOk());

    expect(hasExchangeLog($logged, 'auth.exchange.redeemed'))->toBeTrue();
});

/**
 * The line that answers "did the request even arrive?". Its absence means the
 * Next handler never reached the backend — a deployment problem — while its
 * presence means the code was spent or expired.
 */
it('records a code that could not be redeemed (invalid)', function (): void {
    $logged = captureExchangeLogs(fn () => $this->postJson('/auth/socialite/exchange', ['code' => 'never-issued'])
        ->assertStatus(422));

    expect(hasExchangeLog($logged, 'auth.exchange.redeem_failed'))->toBeTrue();
});

it('records a second redemption of the same code as a failure (invalid — single use)', function (): void {
    $code = app(ExchangeCodeStore::class)->put('a-token', 60);
    $this->postJson('/auth/socialite/exchange', ['code' => $code])->assertOk();

    $logged = captureExchangeLogs(fn () => $this->postJson('/auth/socialite/exchange', ['code' => $code])
        ->assertStatus(422));

    expect(hasExchangeLog($logged, 'auth.exchange.redeem_failed'))->toBeTrue();
});

it('never writes the exchange code or the token to a log context (garbage — both are secrets)', function (): void {
    $code = app(ExchangeCodeStore::class)->put('super-secret-token', 60);

    $logged = captureExchangeLogs(fn () => $this->postJson('/auth/socialite/exchange', ['code' => $code]));

    foreach ($logged as $entry) {
        $context = json_encode($entry->context, JSON_THROW_ON_ERROR);
        expect($context)->not->toContain($code);
        expect($context)->not->toContain('super-secret-token');
    }
});
