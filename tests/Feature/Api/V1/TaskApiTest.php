<?php

namespace Tests\Feature\Api\V1;

use App\Models\Category;
use App\Models\Task;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaskApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_is_paginated(): void
    {
        Task::factory()->count(15)->create();

        $response = $this->getJson('/api/v1/tasks');

        $response->assertOk()
            ->assertJsonStructure(['data', 'links', 'meta'])
            ->assertJsonCount(10, 'data');
    }

    public function test_index_can_filter_by_category(): void
    {
        $a = Category::factory()->create();
        $b = Category::factory()->create();
        Task::factory()->for($a)->count(2)->create();
        Task::factory()->for($b)->count(3)->create();

        $response = $this->getJson('/api/v1/tasks?category_id='.$b->id);

        $response->assertOk()->assertJsonCount(3, 'data');
    }

    public function test_history_returns_soft_deleted(): void
    {
        $task = Task::factory()->create();
        $task->delete();

        $this->getJson('/api/v1/tasks')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/tasks?trashed=only')->assertJsonCount(1, 'data');
    }

    public function test_show_returns_task(): void
    {
        $task = Task::factory()->create();

        $this->getJson("/api/v1/tasks/{$task->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $task->id);
    }

    public function test_show_missing_returns_404(): void
    {
        $this->getJson('/api/v1/tasks/999')->assertNotFound();
    }

    public function test_store_creates_task_with_ttl(): void
    {
        $category = Category::factory()->create();

        $response = $this->postJson('/api/v1/tasks', [
            'category_id' => $category->id,
            'title' => 'Write the plan',
            'body' => 'Cover every endpoint',
        ]);

        $response->assertCreated()->assertJsonPath('data.title', 'Write the plan');
        $this->assertNotNull(Task::firstWhere('title', 'Write the plan')->expires_at);
    }

    public function test_store_with_kept_creates_task_without_expiry(): void
    {
        $category = Category::factory()->create();

        $this->postJson('/api/v1/tasks', [
            'category_id' => $category->id,
            'title' => 'Keep me around',
            'body' => 'No countdown for this one',
            'kept' => true,
        ])->assertCreated()->assertJsonPath('data.expires_at', null);

        $this->assertNull(Task::firstWhere('title', 'Keep me around')->expires_at);
    }

    public function test_store_default_expiry_is_about_12_hours(): void
    {
        $category = Category::factory()->create();

        $this->postJson('/api/v1/tasks', [
            'category_id' => $category->id,
            'title' => 'Countdown task',
            'body' => 'Should expire in 12h',
        ])->assertCreated();

        $expiresAt = Task::firstWhere('title', 'Countdown task')->expires_at;
        $this->assertEqualsWithDelta(12 * 3600, now()->diffInSeconds($expiresAt), 5);
    }

    public function test_update_can_mark_task_as_kept(): void
    {
        $task = Task::factory()->create(['expires_at' => now()->addHours(3)]);

        $this->putJson("/api/v1/tasks/{$task->id}", [
            'category_id' => $task->category_id,
            'title' => $task->title,
            'body' => $task->body,
            'kept' => true,
        ])->assertOk()->assertJsonPath('data.expires_at', null);

        $this->assertNull($task->fresh()->expires_at);
    }

    public function test_update_kept_false_preserves_existing_expiry(): void
    {
        $expiry = now()->addHours(3)->startOfSecond();
        $task = Task::factory()->create(['expires_at' => $expiry]);

        $this->putJson("/api/v1/tasks/{$task->id}", [
            'category_id' => $task->category_id,
            'title' => $task->title,
            'body' => $task->body,
            'kept' => false,
        ])->assertOk();

        $this->assertTrue($task->fresh()->expires_at->equalTo($expiry));
    }

    public function test_update_kept_false_on_kept_task_starts_fresh_countdown(): void
    {
        $task = Task::factory()->create(['expires_at' => null]);

        $this->putJson("/api/v1/tasks/{$task->id}", [
            'category_id' => $task->category_id,
            'title' => $task->title,
            'body' => $task->body,
            'kept' => false,
        ])->assertOk();

        $expiresAt = $task->fresh()->expires_at;
        $this->assertNotNull($expiresAt);
        $this->assertEqualsWithDelta(12 * 3600, now()->diffInSeconds($expiresAt), 5);
    }

    public function test_update_without_kept_leaves_expiry_untouched(): void
    {
        // A locked (kept) task can no longer be edited without unlocking it (see
        // test_update_locked_task_returns_423), so this exercises the still-relevant
        // case: a plain update on a countdown task must not touch its expiry.
        $expiry = now()->addHours(3)->startOfSecond();
        $task = Task::factory()->create(['expires_at' => $expiry]);

        $this->putJson("/api/v1/tasks/{$task->id}", [
            'category_id' => $task->category_id,
            'title' => 'Renamed',
            'body' => $task->body,
        ])->assertOk();

        $this->assertTrue($task->fresh()->expires_at->equalTo($expiry));
    }

    public function test_soft_deleted_title_can_be_reused(): void
    {
        $task = Task::factory()->create(['title' => 'Repeat me']);
        $task->delete();

        $this->postJson('/api/v1/tasks', [
            'category_id' => $task->category_id,
            'title' => 'Repeat me',
            'body' => 'Same title, old one is in History',
        ])->assertCreated();
    }

    public function test_expired_title_can_be_reused(): void
    {
        $task = Task::factory()->expired()->create(['title' => 'Old news']);

        $this->postJson('/api/v1/tasks', [
            'category_id' => $task->category_id,
            'title' => 'Old news',
            'body' => 'Same title, old one already expired',
        ])->assertCreated();
    }

    public function test_live_title_still_blocks_duplicates(): void
    {
        $task = Task::factory()->create(['title' => 'Taken', 'expires_at' => now()->addHours(6)]);

        $this->postJson('/api/v1/tasks', [
            'category_id' => $task->category_id,
            'title' => 'Taken',
            'body' => 'Should be rejected',
        ])->assertStatus(422)->assertJsonValidationErrors('title');
    }

    public function test_store_validation_fails_without_title(): void
    {
        $category = Category::factory()->create();

        $this->postJson('/api/v1/tasks', [
            'category_id' => $category->id,
            'body' => 'no title',
        ])->assertStatus(422)->assertJsonValidationErrors('title');
    }

    public function test_update_changes_task(): void
    {
        // Countdown (non-kept) task: unaffected by the locked-task guard.
        $task = Task::factory()->create(['expires_at' => now()->addHours(6)]);

        $this->putJson("/api/v1/tasks/{$task->id}", [
            'category_id' => $task->category_id,
            'title' => 'Updated title',
            'body' => 'Updated body',
        ])->assertOk()->assertJsonPath('data.title', 'Updated title');
    }

    public function test_destroy_soft_deletes_and_returns_204(): void
    {
        // Countdown (non-kept) task: unaffected by the locked-task guard.
        $task = Task::factory()->create(['expires_at' => now()->addHours(6)]);

        $this->deleteJson("/api/v1/tasks/{$task->id}")->assertNoContent();
        $this->assertSoftDeleted('tasks', ['id' => $task->id]);
    }

    public function test_show_returns_404_for_expired_task(): void
    {
        $task = Task::factory()->expired()->create();

        $this->getJson("/api/v1/tasks/{$task->id}")->assertNotFound();
    }

    public function test_update_returns_404_for_expired_task(): void
    {
        $task = Task::factory()->expired()->create();

        $this->putJson("/api/v1/tasks/{$task->id}", [
            'category_id' => $task->category_id,
            'title' => 'New title',
            'body' => 'New body',
        ])->assertNotFound();
    }

    public function test_destroy_returns_404_for_expired_task(): void
    {
        $task = Task::factory()->expired()->create();

        $this->deleteJson("/api/v1/tasks/{$task->id}")->assertNotFound();
    }

    public function test_validation_error_uses_json_envelope(): void
    {
        $category = Category::factory()->create();

        $this->postJson('/api/v1/tasks', [
            'category_id' => $category->id,
            'body' => 'no title',
        ])->assertStatus(422)->assertJsonStructure(['message', 'errors' => ['title']]);
    }

    public function test_missing_resource_uses_json_envelope(): void
    {
        $this->getJson('/api/v1/tasks/999')
            ->assertNotFound()
            ->assertJsonStructure(['message']);
    }

    public function test_update_locked_task_returns_423(): void
    {
        $task = Task::factory()->create(['expires_at' => null]);

        $this->putJson("/api/v1/tasks/{$task->id}", [
            'title' => 'New title',
            'body' => 'New body',
            'category_id' => $task->category_id,
        ])->assertStatus(423);

        $this->assertSame($task->title, $task->fresh()->title);
    }

    public function test_destroy_locked_task_returns_423(): void
    {
        $task = Task::factory()->create(['expires_at' => null]);

        $this->deleteJson("/api/v1/tasks/{$task->id}")->assertStatus(423);

        $this->assertNotSoftDeleted('tasks', ['id' => $task->id]);
    }

    public function test_unlock_starts_fresh_countdown_and_allows_edit(): void
    {
        $task = Task::factory()->create(['expires_at' => null]);

        $this->putJson("/api/v1/tasks/{$task->id}", [
            'title' => 'Unlocked title',
            'body' => $task->body,
            'category_id' => $task->category_id,
            'kept' => false,
        ])->assertOk()->assertJsonPath('data.title', 'Unlocked title');

        $this->assertNotNull($task->fresh()->expires_at);
    }

    public function test_countdown_task_still_updates_and_deletes_normally(): void
    {
        $task = Task::factory()->create(['expires_at' => now()->addHours(6)]);

        $this->putJson("/api/v1/tasks/{$task->id}", [
            'title' => 'Edited',
            'body' => $task->body,
            'category_id' => $task->category_id,
        ])->assertOk();

        $this->deleteJson("/api/v1/tasks/{$task->id}")->assertNoContent();
    }
}
