<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Presentation\Http;

use App\Cqrs\Bus\CommandBus;
use App\Cqrs\Bus\QueryBus;
use App\Models\User;
use App\Modules\Gateway\Application\Commands\IngestResult;
use App\Modules\Gateway\Application\Commands\RecordPluginMessagesCommand;
use App\Modules\Gateway\Application\Queries\PollPluginCommandsQuery;
use App\Modules\Gateway\Presentation\Http\Requests\RecordPluginMessagesRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;

class PluginTransportController
{
    private const MAX_BODY_BYTES = 524_288;

    private const MAX_POLL_SECONDS = 25;

    public function __construct(
        private CommandBus $commandBus,
        private QueryBus $queryBus,
    ) {}

    /**
     * Ingest a batch of protocol messages from the EuroScope plugin.
     *
     * @bodyParam messages object[] required Up to 200 protocol v1 envelopes. Example: [{"type":"event","callsign":"DLH4TX","action":"flight_updated","payload":{}}]
     *
     * @response 204
     */
    public function store(RecordPluginMessagesRequest $request): Response
    {
        if (strlen((string) $request->getContent()) > self::MAX_BODY_BYTES) {
            abort(413, __('gateway.batch_too_large'));
        }

        $user = $request->user();
        assert($user instanceof User);

        $result = $this->commandBus->dispatch(new RecordPluginMessagesCommand(
            userId: $user->id,
            messages: $request->validated('messages'),
        ));
        assert($result instanceof IngestResult);

        if ($result->dropped > 0) {
            Log::info('gateway: dropped non-object batch entries', [
                'user_id' => $user->id,
                'dropped' => $result->dropped,
                'stored' => $result->stored,
            ]);
        }

        return response()->noContent();
    }

    /**
     * Long-poll for commands queued for the EuroScope plugin.
     *
     * Holds the request up to `timeout` seconds (max 25) waiting for commands.
     *
     * @response 200 {"commands": [{"type": "command", "id": "req-42", "callsign": "ABC1234", "action": "set_squawk", "payload": {"code": "2354"}}]}
     * @response 204
     */
    public function poll(Request $request): JsonResponse|Response
    {
        $user = $request->user();
        assert($user instanceof User);

        $timeout = max(1, min((int) $request->query('timeout', '25'), self::MAX_POLL_SECONDS));

        /** @var array<int, string> $commands */
        $commands = $this->queryBus->dispatch(new PollPluginCommandsQuery(
            userId: $user->id,
            timeoutSeconds: $timeout,
        ));

        if ($commands === []) {
            return response()->noContent();
        }

        return response()->json([
            'commands' => array_map(fn (string $json): mixed => json_decode($json, true), $commands),
        ]);
    }
}
