<?php

declare(strict_types=1);

use App\Cqrs\Command;
use App\Modules\Gateway\Application\Commands\RotateGatewayTokenCommand;
use App\Modules\Gateway\Application\Commands\RotateGatewayTokenHandler;
use Spatie\LaravelData\Data;
use Tests\Support\Modules\Gateway\InMemoryGatewayTokenRepository;

it('delegates rotation to the repository (happy)', function (): void {
    $repo = new InMemoryGatewayTokenRepository;
    $handler = new RotateGatewayTokenHandler($repo);

    $token = $handler->handle(new RotateGatewayTokenCommand(userId: 7));

    expect($token->plainText)->toBe('secret-1');
    expect($repo->rotations)->toBe(1);
});

it('rejects a garbage Command type (garbage)', function (): void {
    $handler = new RotateGatewayTokenHandler(new InMemoryGatewayTokenRepository);

    $bogus = new class extends Data implements Command
    {
        public function __construct(public string $x = '') {}
    };

    expect(fn () => $handler->handle($bogus))->toThrow(InvalidArgumentException::class);
});
