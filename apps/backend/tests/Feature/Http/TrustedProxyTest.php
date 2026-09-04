<?php

declare(strict_types=1);

use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Http\Request;

/**
 * Cloudflare terminates TLS and forwards to Octane over plain HTTP. Without
 * an explicit trustProxies() the framework discards X-Forwarded-Proto, and
 * every absolute URL the app generates comes out http:// — which is what put
 * `location: http://api.eurostrip.ferrlab.com/admin/login` in the admin
 * redirect chain and cost an extra Cloudflare 301 on every hop.
 *
 * Request::create() builds a throwaway request object rather than touching
 * $_SERVER, so nothing here leaks into the rest of the suite.
 */
function handleThroughTrustProxies(Request $request): void
{
    app(TrustProxies::class)->handle($request, fn (Request $r): Request => $r);
}

afterEach(function (): void {
    // setTrustedProxies() is static on the Request class; reset it so a later
    // test in this process does not inherit the trust configured above.
    Request::setTrustedProxies([], Request::HEADER_X_FORWARDED_FOR);
});

it('honours the forwarded scheme so generated URLs stay https (happy)', function (): void {
    $request = Request::create('http://api.eurostrip.test/admin/login', server: [
        'REMOTE_ADDR' => '172.71.0.1',
        'HTTP_X_FORWARDED_PROTO' => 'https',
    ]);

    handleThroughTrustProxies($request);

    expect($request->isSecure())->toBeTrue();
    expect($request->getSchemeAndHttpHost())->toBe('https://api.eurostrip.test');
});

it('honours the forwarded host (happy)', function (): void {
    $request = Request::create('http://backend:8000/admin', server: [
        'REMOTE_ADDR' => '172.71.0.1',
        'HTTP_X_FORWARDED_PROTO' => 'https',
        'HTTP_X_FORWARDED_HOST' => 'api.eurostrip.test',
    ]);

    handleThroughTrustProxies($request);

    expect($request->getSchemeAndHttpHost())->toBe('https://api.eurostrip.test');
});

it('stays on http when the proxy forwards no scheme (invalid — nothing to honour)', function (): void {
    $request = Request::create('http://api.eurostrip.test/admin/login', server: [
        'REMOTE_ADDR' => '172.71.0.1',
    ]);

    handleThroughTrustProxies($request);

    expect($request->isSecure())->toBeFalse();
});

it('does not read https out of a junk forwarded scheme (garbage)', function (): void {
    $request = Request::create('http://api.eurostrip.test/admin/login', server: [
        'REMOTE_ADDR' => '172.71.0.1',
        'HTTP_X_FORWARDED_PROTO' => 'gopher',
    ]);

    handleThroughTrustProxies($request);

    expect($request->isSecure())->toBeFalse();
});
