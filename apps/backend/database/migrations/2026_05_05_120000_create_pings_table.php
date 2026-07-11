<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pings', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            // Translatable map: { "en": "...", "pt": "..." }. On Postgres this
            // resolves to JSONB; on other drivers (e.g. sqlite under tests)
            // Laravel transparently uses JSON / TEXT as appropriate.
            $table->json('note');
            $table->timestampTz('created_at');
            $table->index(['user_id', 'created_at']);
        });

        // Promote `note` to JSONB on Postgres so we get GIN-indexable JSON
        // semantics. Skip on other drivers; `json()` already gave us the
        // right column type there.
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE pings ALTER COLUMN note TYPE jsonb USING note::jsonb');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('pings');
    }
};
