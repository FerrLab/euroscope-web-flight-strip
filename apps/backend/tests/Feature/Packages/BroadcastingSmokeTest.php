<?php

declare(strict_types=1);

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Event;

class SmokeBroadcastEvent implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function broadcastOn(): array
    {
        return [new Channel('smoke')];
    }
}

it('broadcasts an event without throwing', function (): void {
    Event::fake();

    event(new SmokeBroadcastEvent);

    Event::assertDispatched(SmokeBroadcastEvent::class);
});
