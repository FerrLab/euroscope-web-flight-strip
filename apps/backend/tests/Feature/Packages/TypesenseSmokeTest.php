<?php

declare(strict_types=1);
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

it('connects to Typesense health endpoint', function (): void {
    $config = config('scout.typesense');
    $url = sprintf(
        '%s://%s:%s/health',
        $config['client-settings']['nodes'][0]['protocol'],
        $config['client-settings']['nodes'][0]['host'],
        $config['client-settings']['nodes'][0]['port'],
    );

    $response = Http::get($url);

    expect($response->ok())->toBeTrue();
    expect($response->json('ok'))->toBeTrue();
});
