<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Authentication\ExchangeCodeStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuthExchangeController
{
    public function exchange(Request $request, ExchangeCodeStore $codes): JsonResponse
    {
        $request->validate(['code' => ['required', 'string']]);

        $token = $codes->redeem((string) $request->input('code'));

        if ($token === null) {
            return response()->json(['message' => 'Invalid or expired code.'], 422);
        }

        return response()->json(['access_token' => $token]);
    }
}
