<?php

declare(strict_types=1);

use App\Models\User;
use App\Modules\Ping\Domain\Ping;
use App\Modules\Ping\Domain\PingNote;
use App\Modules\Ping\Infrastructure\EloquentPingRepository;
use App\Modules\Ping\Infrastructure\PingModel;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('persists and retrieves a ping (happy)', function (): void {
    $user = User::factory()->create();
    $repo = new EloquentPingRepository;

    $id = '01HXX0KW7QZ8AYQB6Q9R8VRN1V';
    $ping = new Ping(
        id: $id,
        userId: $user->id,
        note: new PingNote(['en' => 'hello', 'pt' => 'olá']),
        createdAt: new DateTimeImmutable('2026-05-05T12:00:00Z'),
    );
    $repo->save($ping);

    $found = $repo->findById($id);
    expect($found)->not->toBeNull();
    assert($found !== null);
    expect($found->note->forLocale('pt'))->toBe('olá');
    expect($found->note->forLocale('en'))->toBe('hello');
    expect($found->userId)->toBe($user->id);
});

it('returns null for unknown id (invalid)', function (): void {
    $repo = new EloquentPingRepository;
    expect($repo->findById('01HXXXXXXXXXXXXXXXXXXXXXXX'))->toBeNull();
});

it('lists recent pings ordered desc by created_at (happy)', function (): void {
    $user = User::factory()->create();
    PingModel::factory()->count(3)->create(['user_id' => $user->id]);

    $repo = new EloquentPingRepository;
    $list = $repo->recentForUser($user->id, 50);

    expect($list)->toHaveCount(3);
    foreach ($list as $p) {
        expect($p)->toBeInstanceOf(Ping::class);
        expect($p->userId)->toBe($user->id);
    }
});

it('returns empty list when user has no pings (garbage)', function (): void {
    $user = User::factory()->create();
    $repo = new EloquentPingRepository;

    expect($repo->recentForUser($user->id))->toBe([]);
});
