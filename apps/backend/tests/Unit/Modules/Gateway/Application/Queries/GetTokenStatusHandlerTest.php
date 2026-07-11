<?php

declare(strict_types=1);

use App\Cqrs\Query;
use App\Modules\Gateway\Application\Queries\GetTokenStatusHandler;
use App\Modules\Gateway\Application\Queries\GetTokenStatusQuery;
use Spatie\LaravelData\Data;
use Tests\Support\Modules\Gateway\InMemoryGatewayTokenRepository;

it('returns null when no token exists (happy)', function (): void {
    $handler = new GetTokenStatusHandler(new InMemoryGatewayTokenRepository);

    expect($handler->handle(new GetTokenStatusQuery(userId: 7)))->toBeNull();
});

it('returns the creation time when a token exists (happy)', function (): void {
    $repo = new InMemoryGatewayTokenRepository;
    $repo->rotate(7);
    $handler = new GetTokenStatusHandler($repo);

    expect($handler->handle(new GetTokenStatusQuery(userId: 7)))->toEqual($repo->createdAt);
});

it('rejects a garbage Query type (garbage)', function (): void {
    $handler = new GetTokenStatusHandler(new InMemoryGatewayTokenRepository);

    $bogus = new class extends Data implements Query
    {
        public function __construct(public string $x = '') {}
    };

    expect(fn () => $handler->handle($bogus))->toThrow(InvalidArgumentException::class);
});
