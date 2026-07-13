<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Presentation\Http\Requests;

use Closure;
use Illuminate\Foundation\Http\FormRequest;

class EnqueuePluginCommandRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'action' => ['required', 'string', 'min:1', 'max:64'],
            'callsign' => ['sometimes', 'nullable', 'string', 'max:16'],
            'payload' => ['sometimes', 'nullable', 'array'],
            'id' => ['sometimes', 'nullable', function (string $attribute, mixed $value, Closure $fail): void {
                if (! is_string($value) && ! is_int($value)) {
                    $fail(__('gateway.id_must_be_scalar'));
                }
            }],
        ];
    }
}
