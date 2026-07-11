<?php

declare(strict_types=1);

namespace App\Modules\Ping\Application\Commands;

use App\Cqrs\Command;
use App\Cqrs\CommandHandler;
use App\Modules\Ping\Domain\Ping;
use App\Modules\Ping\Domain\PingNote;
use App\Modules\Ping\Domain\PingRepository;
use DateTimeImmutable;
use InvalidArgumentException;
use Symfony\Component\Uid\Ulid;

class RecordPingHandler implements CommandHandler
{
    public function __construct(private PingRepository $repository) {}

    public function handle(Command $command): Ping
    {
        if (! $command instanceof RecordPingCommand) {
            throw new InvalidArgumentException(
                sprintf('%s expects RecordPingCommand, got %s', self::class, $command::class),
            );
        }

        $ping = new Ping(
            id: (string) new Ulid,
            userId: $command->userId,
            note: new PingNote($command->note),
            createdAt: new DateTimeImmutable,
        );

        $this->repository->save($ping);

        return $ping;
    }
}
