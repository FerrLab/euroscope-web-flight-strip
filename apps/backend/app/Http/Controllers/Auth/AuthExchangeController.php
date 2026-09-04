<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Authentication\ExchangeCodeStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class AuthExchangeController
{
    public function exchange(Request $request, ExchangeCodeStore $codes): JsonResponse
    {
        $request->validate(['code' => ['required', 'string']]);

        $token = $codes->redeem((string) $request->input('code'));

        if ($token === null) {
            // The counterpart to the Next handler's auth.exchange.rejected.
            // Between the two, a failed sign-in is answerable: this line
            // present means the request arrived and the code was already
            // spent or past its TTL; this line absent means it never got
            // here at all, which is a deployment problem, not a code one.
            // The code itself is never logged — it is bearer-equivalent.
            Log::warning('auth.exchange.redeem_failed', ['ip' => $request->ip()]);

            return response()->json(['message' => 'Invalid or expired code.'], 422);
        }

        Log::info('auth.exchange.redeemed', ['ip' => $request->ip()]);

        return response()->json(['access_token' => $token]);
    }
}
