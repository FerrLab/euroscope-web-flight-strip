<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Commands;

use App\Cqrs\Command;
use App\Cqrs\CommandHandler;
use App\Modules\Gateway\Domain\GatewayToken;
use App\Modules\Gateway\Domain\GatewayTokenRepository;
use InvalidArgumentException;

class RotateGatewayTokenHandler implements CommandHandler
{
    public function __construct(private GatewayTokenRepository $tokens) {}

    public function handle(Command $command): GatewayToken
    {
        if (! $command instanceof RotateGatewayTokenCommand) {
            throw new InvalidArgumentException(
                sprintf('%s expects RotateGatewayTokenCommand, got %s', self::class, $command::class),
            );
        }

        return $this->tokens->rotate($command->userId);
    }
}
