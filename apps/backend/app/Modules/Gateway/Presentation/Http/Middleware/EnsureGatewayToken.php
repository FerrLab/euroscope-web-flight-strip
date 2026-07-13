<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Presentation\Http\Middleware;

use App\Modules\Gateway\Infrastructure\PassportGatewayTokenRepository;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Both the web session and the plugin authenticate as the same user via
 * Passport PATs; the token NAME is the boundary between the two surfaces.
 * `:require` gates plugin transport routes, `:reject` keeps a leaked
 * gateway token away from the browser-facing API.
 */
final class EnsureGatewayToken
{
    public function handle(Request $request, Closure $next, string $mode): Response
    {
        // Laravel\Passport\AccessToken forwards unknown properties to the
        // underlying Token model via __get(), but that model is only typed
        // as ScopeAuthorizable here, so `name` is invisible to static analysis.
        // @phpstan-ignore property.notFound
        $tokenName = $request->user()?->token()?->name;
        $isGateway = $tokenName === PassportGatewayTokenRepository::TOKEN_NAME;

        if ($mode === 'require' && ! $isGateway) {
            abort(403, __('gateway.token_required'));
        }
        if ($mode === 'reject' && $isGateway) {
            abort(403, __('gateway.token_not_allowed'));
        }

        return $next($request);
    }
}
