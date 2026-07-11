<?php

declare(strict_types=1);

namespace App\Modules\Ping\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RecordPingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'note' => ['required', 'array', 'min:1'],
            'note.*' => ['required', 'string', 'min:1', 'max:500'],
        ];
    }
}
