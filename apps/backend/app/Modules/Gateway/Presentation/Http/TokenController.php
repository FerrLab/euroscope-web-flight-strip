<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Presentation\Http;

use App\Cqrs\Bus\CommandBus;
use App\Cqrs\Bus\QueryBus;
use App\Models\User;
use App\Modules\Gateway\Application\Commands\RotateGatewayTokenCommand;
use App\Modules\Gateway\Application\Queries\GetTokenStatusQuery;
use App\Modules\Gateway\Domain\GatewayToken;
use DateTimeImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TokenController
{
    public function __construct(
        private CommandBus $commandBus,
        private QueryBus $queryBus,
    ) {}

    /**
     * Create (or rotate) the gateway token.
     *
     * Revokes any previous gateway token. The plaintext secret is returned
     * exactly once and never retrievable again.
     *
     * @response 201 {"token": "eyJ0…", "created_at": "2026-07-10T12:00:00+00:00"}
     */
    public function rotate(Request $request): JsonResponse
    {
        $user = $request->user();
        assert($user instanceof User);

        $token = $this->commandBus->dispatch(new RotateGatewayTokenCommand(userId: $user->id));
        assert($token instanceof GatewayToken);

        return response()->json([
            'token' => $token->plainText,
            'created_at' => $token->createdAt->format(DATE_ATOM),
        ], 201);
    }

    /**
     * Gateway token metadata (never the secret).
     *
     * @response 200 {"exists": true, "created_at": "2026-07-10T12:00:00+00:00"}
     */
    public function status(Request $request): JsonResponse
    {
        $user = $request->user();
        assert($user instanceof User);

        /** @var ?DateTimeImmutable $createdAt */
        $createdAt = $this->queryBus->dispatch(new GetTokenStatusQuery(userId: $user->id));

        return response()->json([
            'exists' => $createdAt !== null,
            'created_at' => $createdAt?->format(DATE_ATOM),
        ]);
    }
}
