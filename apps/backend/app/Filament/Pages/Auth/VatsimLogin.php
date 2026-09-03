<?php

declare(strict_types=1);

namespace App\Filament\Pages\Auth;

use Filament\Auth\Pages\Login as BaseLogin;

/**
 * The admin panel has no password form — VATSIM Connect is the only way in
 * (ADR 0010). This keeps Filament's own login route registered, so its auth
 * middleware, logout redirect and canAccessPanel() failures all still
 * resolve somewhere sensible, but the page never renders a form: it bounces
 * straight to the provider.
 *
 * mount() is void in the parent (Filament\Auth\Pages\Login), so the redirect
 * goes through Livewire's redirector rather than a returned response.
 */
class VatsimLogin extends BaseLogin
{
    public function mount(): void
    {
        if (auth()->check()) {
            $this->redirectIntended('/admin');

            return;
        }

        $this->redirectRoute('auth.socialite.vatsim.admin.redirect');
    }
}
