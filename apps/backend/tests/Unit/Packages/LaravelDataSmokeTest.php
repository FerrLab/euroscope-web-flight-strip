<?php

declare(strict_types=1);

use Spatie\LaravelData\Data;
use Tests\TestCase;

uses(TestCase::class);

class SmokePingData extends Data
{
    public function __construct(public string $note) {}
}

it('round-trips a Spatie Data object', function (): void {
    $data = SmokePingData::from(['note' => 'hello']);

    expect($data->note)->toBe('hello');
    expect($data->toArray())->toBe(['note' => 'hello']);
});
