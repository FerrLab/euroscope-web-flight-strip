<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\User;
use App\Modules\Ping\Infrastructure\PingModel;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<PingModel> */
class PingFactory extends Factory
{
    protected $model = PingModel::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'note' => ['en' => $this->faker->sentence(), 'pt' => $this->faker->sentence()],
            'created_at' => now(),
        ];
    }
}
