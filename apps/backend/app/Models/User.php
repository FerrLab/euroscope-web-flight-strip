<?php

declare(strict_types=1);

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Authorization\Roles\Role;
use Database\Factories\UserFactory;
use Filament\Models\Contracts\FilamentUser;
use Filament\Panel;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Passport\Contracts\OAuthenticatable;
use Laravel\Passport\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

#[Fillable(['name', 'email', 'password', 'vatsim_cid'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable implements FilamentUser, OAuthenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasRoles, Notifiable;

    /**
     * Pin Spatie permission lookups to the `web` guard regardless of the
     * runtime auth guard (Passport flips the default to `api` during API
     * requests). Roles & permissions are stored once under `web`; this keeps
     * Filament and API authorization checks consistent.
     */
    protected string $guard_name = 'web';

    public function canAccessPanel(Panel $panel): bool
    {
        return $this->hasRole(Role::Admin->value);
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }
}
