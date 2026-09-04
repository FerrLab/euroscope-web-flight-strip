import { NextResponse } from 'next/server';

/**
 * Redirect to a path on whatever origin the browser actually used.
 *
 * Route handlers must NOT derive a redirect origin from `request.url`.
 * Next builds that URL from the server's *bind* address, not the request:
 * `${protocol}://${fetchHostname}:${port}${req.url}` (see
 * `next/dist/server/next-server.js`, `attachRequestMeta`). The production
 * image binds `HOSTNAME=0.0.0.0` (infra/docker/nextjs.Dockerfile), so
 * `new URL(request.url)` yields `http://0.0.0.0:3000` and any absolute
 * `Location` built from it sends the browser nowhere. Only the scheme is
 * request-derived (from `x-forwarded-proto`); the host never is.
 *
 * A root-relative `Location` sidesteps the problem entirely — RFC 7231
 * §7.1.2 has allowed relative references since 2014, and the browser
 * resolves them against the URL it requested. That needs no public-origin
 * env var, so it cannot drift out of sync with the deployment.
 *
 * `NextResponse.redirect()` requires an absolute URL, hence the manual
 * `Location` header here.
 *
 * @param path Root-relative path, e.g. `/en/dashboard` or `/en/login?error=oauth`.
 * @throws TypeError when `path` is not root-relative — an absolute or
 *   protocol-relative value would reintroduce a fixed origin, and in the
 *   protocol-relative case (`//host/...`) an off-site open redirect.
 */
export function relativeRedirect(path: string, status = 302): NextResponse {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new TypeError(`relativeRedirect() expects a root-relative path, got: ${path}`);
  }

  return new NextResponse(null, {
    status,
    headers: { Location: path },
  });
}
