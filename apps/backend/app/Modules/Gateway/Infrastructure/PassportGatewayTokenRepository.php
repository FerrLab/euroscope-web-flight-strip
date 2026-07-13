<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Infrastructure;

use App\Models\User;
use App\Modules\Gateway\Domain\GatewayToken;
use App\Modules\Gateway\Domain\GatewayTokenRepository;
use DateTimeImmutable;
use RuntimeException;

final class PassportGatewayTokenRepository implements GatewayTokenRepository
{
    public const TOKEN_NAME = 'gateway';

    public function rotate(int $userId): GatewayToken
    {
        $user = User::query()->findOrFail($userId);

        $user->tokens()
            ->where('name', self::TOKEN_NAME)
            ->where('revoked', false)
            ->get()
            ->each(fn ($token) => $token->revoke());

        $result = $user->createToken(self::TOKEN_NAME);

        $token = $result->getToken()
            ?? throw new RuntimeException('Newly minted gateway token could not be reloaded.');

        $createdAt = $token->created_at
            ?? throw new RuntimeException('Newly minted gateway token is missing its creation timestamp.');

        return new GatewayToken(
            plainText: $result->accessToken,
            createdAt: $createdAt->toDateTimeImmutable(),
        );
    }

    public function activeTokenCreatedAt(int $userId): ?DateTimeImmutable
    {
        $token = User::query()->findOrFail($userId)
            ->tokens()
            ->where('name', self::TOKEN_NAME)
            ->where('revoked', false)
            ->latest('created_at')
            ->first();

        return $token?->created_at?->toDateTimeImmutable();
    }
}
