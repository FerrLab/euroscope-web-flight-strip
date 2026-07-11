<?php

declare(strict_types=1);

namespace App\Modules\Ping\Presentation\Http;

use App\Cqrs\Bus\CommandBus;
use App\Cqrs\Bus\QueryBus;
use App\Models\User;
use App\Modules\Ping\Application\Commands\RecordPingCommand;
use App\Modules\Ping\Application\Queries\ListPingsQuery;
use App\Modules\Ping\Domain\Ping;
use App\Modules\Ping\Presentation\Http\Requests\RecordPingRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PingController
{
    public function __construct(
        private CommandBus $commandBus,
        private QueryBus $queryBus,
    ) {}

    /**
     * List recent pings for the authenticated user.
     *
     * @response array{0: array{id: string, note: array<string, string>, created_at: string}}
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        assert($user instanceof User);

        /** @var array<int, Ping> $pings */
        $pings = $this->queryBus->dispatch(new ListPingsQuery(
            userId: $user->id,
            limit: 50,
        ));

        return response()->json(
            array_map(fn (Ping $p): array => [
                'id' => $p->id,
                'note' => $p->note->translations,
                'created_at' => $p->createdAt->format(DATE_ATOM),
            ], $pings),
        );
    }

    /**
     * Record a new ping.
     *
     * @bodyParam note object required Translatable note map (locale → text). Example: {"en":"hello","pt":"olá"}
     */
    public function store(RecordPingRequest $request): JsonResponse
    {
        $user = $request->user();
        assert($user instanceof User);

        $ping = $this->commandBus->dispatch(new RecordPingCommand(
            userId: $user->id,
            note: $request->validated('note'),
        ));
        assert($ping instanceof Ping);

        return response()->json([
            'id' => $ping->id,
            'note' => $ping->note->translations,
            'created_at' => $ping->createdAt->format(DATE_ATOM),
        ], 201);
    }
}
