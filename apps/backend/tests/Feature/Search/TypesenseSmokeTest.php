<?php

declare(strict_types=1);

use Typesense\Client;

it('reaches the live Typesense node and reports healthy', function (): void {
    /** @var Client $client */
    $client = app(Client::class);

    $health = $client->health->retrieve();

    expect($health)
        ->toBeArray()
        ->and($health['ok'] ?? null)->toBeTrue();
})->group('integration', 'typesense');

it('lists collections without error', function (): void {
    /** @var Client $client */
    $client = app(Client::class);

    $collections = $client->collections->retrieve();

    expect($collections)->toBeArray();
})->group('integration', 'typesense');
