<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreTaskRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'category_id' => ['required', 'integer', 'exists:categories,id'],
            'title' => [
                'required', 'string', 'max:255',
                // Only live tasks block a title: ignore soft-deleted and expired rows.
                Rule::unique('tasks', 'title')
                    ->whereNull('deleted_at')
                    ->where(fn ($query) => $query->whereNull('expires_at')->orWhere('expires_at', '>', now())),
            ],
            'body' => ['required', 'string', 'max:1000'],
            'kept' => ['sometimes', 'boolean'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'title' => is_string($this->title) ? strip_tags($this->title) : $this->title,
            'body' => is_string($this->body) ? strip_tags($this->body) : $this->body,
        ]);
    }
}
