<?php

declare(strict_types=1);

namespace App\Modules\Gateway\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RecordPluginMessagesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * Entries are deliberately NOT validated per-item: the gateway is
     * transport, and the handler drops non-objects without failing the batch.
     *
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'messages' => ['required', 'array', 'max:200'],
        ];
    }
}
