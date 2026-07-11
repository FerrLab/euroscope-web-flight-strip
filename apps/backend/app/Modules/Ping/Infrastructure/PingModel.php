<?php

declare(strict_types=1);

namespace App\Modules\Ping\Infrastructure;

use Database\Factories\PingFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Laravel\Scout\Searchable;
use Spatie\Translatable\HasTranslations;

/**
 * @method static PingFactory factory(...$parameters)
 */
class PingModel extends Model
{
    /** @use HasFactory<PingFactory> */
    use HasFactory, HasTranslations, HasUlids, Searchable;

    public const UPDATED_AT = null; // pings are append-only

    protected $table = 'pings';

    protected $fillable = ['id', 'user_id', 'note', 'created_at'];

    protected $casts = ['created_at' => 'immutable_datetime'];

    /** @var array<int, string> */
    public array $translatable = ['note'];

    /** @return array<string, mixed> */
    public function toSearchableArray(): array
    {
        return [
            'id' => (string) $this->id,
            'user_id' => (string) $this->user_id,
            'note_en' => (string) $this->getTranslation('note', 'en', false),
            'note_pt' => (string) $this->getTranslation('note', 'pt', false),
        ];
    }

    protected static function newFactory(): PingFactory
    {
        return PingFactory::new();
    }
}
