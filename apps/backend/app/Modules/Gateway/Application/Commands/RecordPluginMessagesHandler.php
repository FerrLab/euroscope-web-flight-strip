<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Application\Commands;

use App\Cqrs\Command;
use App\Cqrs\CommandHandler;
use App\Modules\Gateway\Domain\Direction;
use App\Modules\Gateway\Domain\GatewayStreamRepository;
use InvalidArgumentException;

class RecordPluginMessagesHandler implements CommandHandler
{
    public function __construct(private GatewayStreamRepository $stream) {}

    public function handle(Command $command): IngestResult
    {
        if (! $command instanceof RecordPluginMessagesCommand) {
            throw new InvalidArgumentException(
                sprintf('%s expects RecordPluginMessagesCommand, got %s', self::class, $command::class),
            );
        }

        $stored = 0;
        $dropped = 0;
        foreach ($command->messages as $message) {
            // The gateway is transport, not validator: store any JSON object
            // verbatim (protocol v1 is additive), drop everything else.
            if (! is_array($message) || array_is_list($message)) {
                $dropped++;

                continue;
            }
            $json = json_encode($message, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if ($json === false) {
                $dropped++;

                continue;
            }
            $this->stream->append($command->userId, Direction::In, $json);
            $stored++;
        }

        return new IngestResult(stored: $stored, dropped: $dropped);
    }
}
