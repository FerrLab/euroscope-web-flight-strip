<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Commands;

use App\Cqrs\Command;
use App\Cqrs\CommandHandler;
use App\Modules\Gateway\Domain\CommandQueueRepository;
use App\Modules\Gateway\Domain\Direction;
use App\Modules\Gateway\Domain\GatewayStreamRepository;
use InvalidArgumentException;
use RuntimeException;
use Symfony\Component\Uid\Ulid;

class EnqueuePluginCommandHandler implements CommandHandler
{
    public function __construct(
        private CommandQueueRepository $queue,
        private GatewayStreamRepository $stream,
    ) {}

    /** @return array<string, mixed> the envelope as queued */
    public function handle(Command $command): array
    {
        if (! $command instanceof EnqueuePluginCommandCommand) {
            throw new InvalidArgumentException(
                sprintf('%s expects EnqueuePluginCommandCommand, got %s', self::class, $command::class),
            );
        }
        if (trim($command->action) === '') {
            throw new InvalidArgumentException('action must be a non-empty string');
        }

        $envelope = [
            'type' => 'command',
            'id' => $command->id ?? (string) new Ulid,
            'action' => $command->action,
        ];
        if ($command->callsign !== null) {
            $envelope['callsign'] = $command->callsign;
        }
        if ($command->payload !== null) {
            $envelope['payload'] = $command->payload;
        }

        $json = json_encode($envelope, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            throw new RuntimeException('envelope could not be encoded as JSON');
        }

        $this->queue->enqueue($command->userId, $json);
        // Mirror into the stream so the sender's own console shows the command.
        $this->stream->append($command->userId, Direction::Out, $json);

        return $envelope;
    }
}
