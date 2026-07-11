<?php

declare(strict_types=1);

it('returns the application root', function (): void {
    $response = $this->get('/');

    $response->assertStatus(200);
});
