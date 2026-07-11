<?php

declare(strict_types=1);

it('renders the Scramble docs UI at /docs/api', function (): void {
    $response = $this->get('/docs/api');

    $response->assertStatus(200);
    expect($response->content())->toContain('Azimuth API');
});

it('serves openapi.json describing the API', function (): void {
    $response = $this->get('/docs/api.json');

    $response->assertStatus(200);
    $body = $response->json();
    expect($body)->toHaveKey('openapi');
    expect($body)->toHaveKey('info.title', 'Azimuth API');
});
