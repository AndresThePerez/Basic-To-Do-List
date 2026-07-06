<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreCategoryRequest;
use App\Http\Requests\UpdateCategoryRequest;
use App\Http\Resources\CategoryResource;
use App\Models\Category;
use Illuminate\Http\Response;

class CategoryController extends Controller
{
    public function index()
    {
        return CategoryResource::collection(Category::withCount(['tasks as tasks_count' => fn ($q) => $q->whereNull('deleted_at')])->latest()->paginate(10));
    }

    public function store(StoreCategoryRequest $request)
    {
        $category = Category::create($request->validated());

        return CategoryResource::make($category)
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(Category $category)
    {
        return CategoryResource::make($category);
    }

    public function update(UpdateCategoryRequest $request, Category $category)
    {
        $category->update($request->validated());

        return CategoryResource::make($category);
    }

    public function destroy(Category $category)
    {
        if ($category->tasks()->whereNull('deleted_at')->exists()) {
            abort(Response::HTTP_CONFLICT, 'This category is still used by open tasks and cannot be deleted.');
        }

        $category->delete();

        return response()->noContent();
    }
}
