<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Presentation\Http;

use App\Cqrs\Bus\CommandBus;
use App\Cqrs\Bus\QueryBus;
use App\Models\User;
use App\Modules\Gateway\Application\Commands\EnqueuePluginCommandCommand;
use App\Modules\Gateway\Application\Queries\ConsoleView;
use App\Modules\Gateway\Application\Queries\TailConsoleMessagesQuery;
use App\Modules\Gateway\Presentation\Http\Requests\EnqueuePluginCommandRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

class ConsoleController
{
    private const MAX_POLL_SECONDS = 15;

    public function __construct(
        private CommandBus $commandBus,
        private QueryBus $queryBus,
    ) {}

    /**
     * Queue a protocol command for the connected EuroScope plugin.
     *
     * @bodyParam action string required Protocol action verb. Example: set_squawk
     * @bodyParam callsign string Flight callsign for flight-scoped actions. Example: ABC1234
     * @bodyParam payload object Action payload. Example: {"code": "2354"}
     * @bodyParam id string Correlation id echoed in the plugin response; auto-generated when omitted.
     *
     * @response 202 {"queued": {"type": "command", "id": "01JZ…", "action": "set_squawk", "callsign": "ABC1234", "payload": {"code": "2354"}}}
     */
    public function send(EnqueuePluginCommandRequest $request): JsonResponse
    {
        $user = $request->user();
        assert($user instanceof User);

        /** @var array<string, mixed> $envelope */
        $envelope = $this->commandBus->dispatch(new EnqueuePluginCommandCommand(
            userId: $user->id,
            action: $request->validated('action'),
            callsign: $request->validated('callsign'),
            payload: $request->validated('payload'),
            id: $request->validated('id'),
        ));

        return response()->json(['queued' => $envelope], 202);
    }

    /**
     * Long-poll the console message feed.
     *
     * Without `after`, returns the ring buffer immediately (backfill). With a
     * cursor, holds up to `timeout` seconds (max 15) for newer messages.
     *
     * @response 200 {"messages": [{"id": "1720527600000-0", "direction": "in", "envelope": {"type": "event", "action": "flight_updated"}}], "cursor": "1720527600000-0", "reset": false, "pluginConnected": true}
     */
    public function poll(Request $request): JsonResponse
    {
        $user = $request->user();
        assert($user instanceof User);

        $after = $request->query('after');
        $afterId = is_string($after) && $after !== '' ? $after : null;
        $timeout = max(0, min((int) $request->query('timeout', '15'), self::MAX_POLL_SECONDS));

        try {
            $view = $this->queryBus->dispatch(new TailConsoleMessagesQuery(
                userId: $user->id,
                afterId: $afterId,
                // Backfill never blocks; only a cursor-carrying tail holds.
                timeoutSeconds: $afterId === null ? 0 : $timeout,
            ));
        } catch (InvalidArgumentException $e) {
            throw ValidationException::withMessages(['after' => $e->getMessage()]);
        }
        assert($view instanceof ConsoleView);

        return response()->json([
            'messages' => array_map(fn (array $m): array => [
                'id' => $m['id'],
                'direction' => $m['direction'],
                'envelope' => json_decode($m['envelope'], true),
            ], $view->batch->messages),
            'cursor' => $view->batch->cursor,
            'reset' => $view->batch->reset,
            'pluginConnected' => $view->pluginConnected,
        ]);
    }
}
