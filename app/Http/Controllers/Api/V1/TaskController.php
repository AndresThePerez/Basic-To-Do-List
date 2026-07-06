<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreTaskRequest;
use App\Http\Requests\UpdateTaskRequest;
use App\Http\Resources\TaskResource;
use App\Models\Task;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class TaskController extends Controller
{
    public function index(Request $request)
    {
        $query = $request->query('trashed') === 'only'
            ? Task::onlyTrashed()
            : Task::query();

        if ($request->filled('category_id')) {
            $query->where('category_id', $request->integer('category_id'));
        }

        return TaskResource::collection($query->latest()->paginate(10));
    }

    public function store(StoreTaskRequest $request)
    {
        $task = Task::create(array_merge(
            $request->safe()->except('kept'),
            ['expires_at' => $request->boolean('kept') ? null : now()->addHours(12)]
        ));

        return TaskResource::make($task)
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(Task $task)
    {
        return TaskResource::make($task);
    }

    public function update(UpdateTaskRequest $request, Task $task)
    {
        $attributes = $request->safe()->except('kept');

        if ($request->has('kept')) {
            // Switching a kept task back to a countdown starts a fresh 12h window;
            // a task that already has a deadline keeps it.
            $attributes['expires_at'] = $request->boolean('kept')
                ? null
                : ($task->expires_at ?? now()->addHours(12));
        }

        $task->update($attributes);

        return TaskResource::make($task);
    }

    public function destroy(Task $task)
    {
        $task->delete();

        return response()->noContent();
    }
}
