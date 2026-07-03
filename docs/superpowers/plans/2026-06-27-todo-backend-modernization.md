# To-Do Backend Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the app to a zero-service SQLite stack and reshape the API into a conventional, fully-tested RESTful CRUD example (Notes→Task rename, `/api/v1` resourceful routes, Resources, pagination, 12h TTL).

**Architecture:** Laravel 12 on the legacy application skeleton (`app/Http/Kernel.php`, `app/Exceptions/Handler.php`, `RouteServiceProvider`). Persistence becomes a single SQLite file; cache/queue move to `database`, session to `file`; Redis and MySQL are removed. The API is rebuilt as resourceful controllers under `App\Http\Controllers\Api\V1` returning API Resources, with a `NotExpired` global scope and a prune command implementing a 12-hour TTL on API-created records.

**Tech Stack:** PHP 8.4, Laravel 12, SQLite, PHPUnit 11, Laravel Pint.

## Global Constraints

- PHP `^8.4`, Laravel `^12.0` (do not change framework major versions).
- Database is **SQLite only**. No MySQL, no Redis anywhere in code, config, or compose files.
- Test database is in-memory SQLite (`DB_CONNECTION=sqlite`, `DB_DATABASE=:memory:`).
- All new API routes live under `/api/v1` and use Laravel `apiResource`-style verbs/paths.
- Models are **singular** (`Task`, `Category`). The `tasks` table replaces `notes`.
- TTL = **12 hours** on records created through the API; seeded/factory records are permanent (`expires_at = null`).
- Success codes: index/show/update → 200, store → 201, destroy → 204. Validation → 422, missing → 404.
- **Runtime is Sail (Docker), not host PHP.** Every `php artisan`, `composer`, `npm`, `test`, and `pint` command in this plan executes **inside the container**: read `php artisan X` as `./vendor/bin/sail artisan X`, `composer X` as `./vendor/bin/sail composer X`, `npm X` as `./vendor/bin/sail npm X`, `php artisan test` as `./vendor/bin/sail test`, and `./vendor/bin/pint` as `./vendor/bin/sail php vendor/bin/pint`. The PHP version comes from the `runtimes/8.4` image. The container must be up (`./vendor/bin/sail up -d`) before running them.
- **"Update dependencies" = refresh the Sail image** (`./vendor/bin/sail build --no-cache`) and install inside it. Do NOT run `composer update`/`npm update` or edit version constraints in `composer.json`/`package.json`; `composer.lock`/`package-lock.json` stay unchanged.
- Run `./vendor/bin/sail php vendor/bin/pint` before every commit; it must report no fixable issues.
- Commit after every task. Conventional Commit prefixes (`chore:`, `feat:`, `refactor:`, `test:`).

---

## File Structure

**CP0 (config/baseline):**
- Modify: `.env.example`, `phpunit.xml`, `docker-compose.yml`, `composer.json`/`package.json` (deps), `config/database.php` (verify sqlite default), `database/database.sqlite` (create).
- Create: `tests/Feature/SmokeTest.php`.

**CP1 (API redesign):**
- Migrations: `database/migrations/2022_12_11_043713_make_motes_table.php` → renamed file creating `tasks` with `expires_at`; `categories` migration unchanged.
- Models: `app/Models/Task.php`, `app/Models/Category.php` (replace `Notes.php`/`Categories.php`); delete `app/Models/Base/BaseModel.php`.
- Scope: `app/Models/Scopes/NotExpiredScope.php`.
- Command: `app/Console/Commands/PruneExpiredTasks.php`; scheduler entry in `app/Console/Kernel.php`.
- Requests: `app/Http/Requests/StoreTaskRequest.php`, `UpdateTaskRequest.php`, `StoreCategoryRequest.php`, `UpdateCategoryRequest.php` (replace `NotesRequest.php`/`CategoriesRequest.php`).
- Resources: `app/Http/Resources/TaskResource.php`, `app/Http/Resources/CategoryResource.php`.
- Controllers: `app/Http/Controllers/Api/V1/TaskController.php`, `CategoryController.php`; delete `NotesController.php`, `CategoriesController.php`, `app/Http/Controllers/Base/BaseController.php`.
- Factories: `database/factories/TaskFactory.php`, `CategoryFactory.php`.
- Seeders: `database/seeders/TaskSeeder.php` (replace `NotesSeeder.php`), `CategoriesSeeder.php` (rename class refs only), `DatabaseSeeder.php`.
- Routes: `routes/api.php`.
- Tests: `tests/Feature/Api/V1/TaskApiTest.php`, `CategoryApiTest.php`; `tests/Unit/NotExpiredScopeTest.php`, `tests/Unit/PruneExpiredTasksTest.php`.

---

# CHECKPOINT 0 — Working baseline on SQLite

**Gate to exit CP0:** `php artisan migrate:fresh --seed` succeeds on SQLite; `php artisan test` passes (smoke test green); `./vendor/bin/pint --test` clean; the legacy UI loads in Chrome MCP showing seeded notes.

### Task 0.1: Reconfigure persistence to SQLite + drop Redis

**Files:**
- Modify: `.env.example`
- Create: `database/database.sqlite`

**Interfaces:**
- Produces: a SQLite-backed environment used by every later task.

- [ ] **Step 1: Rewrite `.env.example`** to the SQLite/no-Redis stack. Replace the entire file with:

```dotenv
APP_NAME=Daybook
APP_ENV=local
APP_KEY=
APP_DEBUG=true
APP_URL=http://localhost

LOG_CHANNEL=stack
LOG_DEPRECATIONS_CHANNEL=null
LOG_LEVEL=debug

DB_CONNECTION=sqlite
# DB_DATABASE defaults to database/database.sqlite

CACHE_STORE=database
QUEUE_CONNECTION=database
SESSION_DRIVER=file
SESSION_LIFETIME=120
BROADCAST_DRIVER=log
FILESYSTEM_DISK=local

MAIL_MAILER=log
MAIL_FROM_ADDRESS="hello@example.com"
MAIL_FROM_NAME="${APP_NAME}"
```

- [ ] **Step 2: Create the SQLite file and a working `.env`.**

Run:
```bash
touch database/database.sqlite
cp .env.example .env
php artisan key:generate
```
Expected: `.env` exists with a populated `APP_KEY`.

- [ ] **Step 3: Create the cache/queue/session tables migration if missing, then migrate+seed.**

Run:
```bash
php artisan migrate:fresh --seed
```
Expected: migrations run against `database/database.sqlite`; `Database\Seeders\CategoriesSeeder` and `NotesSeeder` complete without error. If `cache`/`jobs`/`sessions` tables are missing for the `database` drivers, run `php artisan make:cache-table`, `php artisan make:queue-table`, `php artisan make:session-table` first, then re-run `migrate:fresh --seed`.

- [ ] **Step 4: Verify data exists.**

Run:
```bash
php artisan tinker --execute="echo \App\Models\Notes::count();"
```
Expected: prints `15` (13 active + 2 soft-deleted notes from the seeder).

- [ ] **Step 5: Commit.**

```bash
./vendor/bin/pint
git add -A
git commit -m "chore: switch persistence to SQLite and drop Redis/MySQL from env"
```

### Task 0.2: Point the test suite at in-memory SQLite

**Files:**
- Modify: `phpunit.xml`

**Interfaces:**
- Produces: a test environment every later test relies on (`RefreshDatabase` on `:memory:`).

- [ ] **Step 1: Edit the `<php>` block in `phpunit.xml`** — replace the `CACHE_DRIVER`/`DB_DATABASE` lines and add a `DB_CONNECTION` line so the block reads:

```xml
    <php>
        <env name="APP_ENV" value="testing"/>
        <env name="BCRYPT_ROUNDS" value="4"/>
        <env name="CACHE_STORE" value="array"/>
        <env name="DB_CONNECTION" value="sqlite"/>
        <env name="DB_DATABASE" value=":memory:"/>
        <env name="MAIL_MAILER" value="array"/>
        <env name="QUEUE_CONNECTION" value="sync"/>
        <env name="SESSION_DRIVER" value="array"/>
        <env name="TELESCOPE_ENABLED" value="false"/>
    </php>
```

- [ ] **Step 2: Commit.**

```bash
git add phpunit.xml
git commit -m "chore: run tests against in-memory SQLite"
```

### Task 0.3: Slim Sail to a single app service

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Replace `docker-compose.yml`** with a single-service file (no mysql, no redis, no volumes):

```yaml
services:
    laravel.test:
        build:
            context: ./vendor/laravel/sail/runtimes/8.4
            dockerfile: Dockerfile
            args:
                WWWGROUP: '${WWWGROUP}'
        image: sail-8.4/app
        extra_hosts:
            - 'host.docker.internal:host-gateway'
        ports:
            - '${APP_PORT:-80}:80'
            - '${VITE_PORT:-5173}:${VITE_PORT:-5173}'
        environment:
            WWWUSER: '${WWWUSER}'
            LARAVEL_SAIL: 1
            XDEBUG_MODE: '${SAIL_XDEBUG_MODE:-off}'
            XDEBUG_CONFIG: '${SAIL_XDEBUG_CONFIG:-client_host=host.docker.internal}'
        volumes:
            - '.:/var/www/html'
        networks:
            - sail
networks:
    sail:
        driver: bridge
```

- [ ] **Step 2: Commit.**

```bash
git add docker-compose.yml
git commit -m "chore: reduce Sail to a single app service"
```

### Task 0.4: Refresh the Sail image and install deps inside the container

**Files:** none tracked (image rebuild + container-local installs). `composer.lock`/`package-lock.json` must remain unchanged.

- [ ] **Step 1: Build/refresh the Sail image** (pulls the latest `8.4` runtime base).

Run:
```bash
./vendor/bin/sail build --no-cache
./vendor/bin/sail up -d
```
Expected: image builds; the `laravel.test` container is `Up`.

- [ ] **Step 2: Install backend + frontend deps inside the container** (from the existing lockfiles — no version bumps).

Run:
```bash
./vendor/bin/sail composer install
./vendor/bin/sail npm install
./vendor/bin/sail npm run build
```
Expected: `public/build/manifest.json` is produced; no errors. Confirm `git status` shows `composer.lock`/`package-lock.json` unchanged.

- [ ] **Step 3: Re-verify migrate+seed inside the container.**

Run:
```bash
./vendor/bin/sail artisan migrate:fresh --seed
```
Expected: completes without error.

- [ ] **Step 4: Commit** (only if any tracked files changed, e.g. a generated cache/queue/session migration from Task 0.1; otherwise skip).

```bash
./vendor/bin/sail php vendor/bin/pint
git add -A
git commit -m "chore: refresh Sail image and install deps in container"
```

### Task 0.5: Smoke test + browser baseline

**Files:**
- Create: `tests/Feature/SmokeTest.php`

**Interfaces:**
- Consumes: seeded SQLite data; legacy route `GET /api/notes/showAll`.

- [ ] **Step 1: Write the failing smoke test.**

```php
<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SmokeTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeded_notes_endpoint_returns_data(): void
    {
        $this->seed();

        $response = $this->getJson('/api/notes/showAll');

        $response->assertOk();
        $this->assertGreaterThan(0, count($response->json()));
    }
}
```

- [ ] **Step 2: Run it and confirm it passes** (the legacy endpoint still exists at this point).

Run: `php artisan test --filter=SmokeTest`
Expected: PASS. (If the seeder or route is broken, this fails — fix before proceeding.)

- [ ] **Step 3: Browser baseline via Chrome MCP.**

Start the app (`php artisan serve` and `npm run dev`, or `./vendor/bin/sail up -d`), navigate Chrome MCP to `http://localhost:8000` (or `:80` under Sail), confirm the notes table renders seeded rows, and take a screenshot saved to the scratchpad. This is a manual gate, not an automated test.

- [ ] **Step 4: Commit.**

```bash
./vendor/bin/pint
git add tests/Feature/SmokeTest.php
git commit -m "test: add SQLite baseline smoke test"
```

---

# CHECKPOINT 1 — RESTful API redesign (TDD)

**Gate to exit CP1:** `php artisan test` fully green (all feature + unit tests below); `./vendor/bin/pint --test` clean; `php artisan migrate:fresh --seed` works; the legacy `NotesController`/`CategoriesController`/`BaseController`/`BaseModel` and bespoke routes are deleted.

> Order matters: rename the schema/models first, then build scope/factories, then requests/resources/controllers/routes, then seeders. The smoke test from CP0 will break when legacy routes are removed in Task 1.8 — that is expected and the task deletes it.

### Task 1.1: Rename the schema (notes → tasks) and add `expires_at`

**Files:**
- Modify→Rename: `database/migrations/2022_12_11_043713_make_motes_table.php` → `database/migrations/2022_12_11_043713_create_tasks_table.php`

**Interfaces:**
- Produces: a `tasks` table with columns `id, category_id (FK), title, body, expires_at (nullable), timestamps, deleted_at`.

- [ ] **Step 1: Rename the migration file.**

```bash
git mv database/migrations/2022_12_11_043713_make_motes_table.php \
       database/migrations/2022_12_11_043713_create_tasks_table.php
```

- [ ] **Step 2: Replace its contents** so it creates `tasks` with the TTL column:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('category_id')->constrained();
            $table->string('title');
            $table->string('body');
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tasks');
    }
};
```

- [ ] **Step 3: Verify the migration runs.**

Run: `php artisan migrate:fresh`
Expected: creates `categories` and `tasks` tables, no error. (Seeders will fail until Task 1.9 — do not `--seed` yet.)

- [ ] **Step 4: Commit.**

```bash
git add -A
git commit -m "refactor: rename notes table to tasks and add expires_at TTL column"
```

### Task 1.2: `NotExpired` global scope (TDD)

**Files:**
- Create: `app/Models/Scopes/NotExpiredScope.php`
- Create: `app/Models/Task.php`, `app/Models/Category.php`
- Create: `database/factories/TaskFactory.php`, `database/factories/CategoryFactory.php`
- Delete: `app/Models/Notes.php`, `app/Models/Categories.php`, `app/Models/Base/BaseModel.php`
- Create: `tests/Unit/NotExpiredScopeTest.php`

**Interfaces:**
- Produces:
  - `App\Models\Task` — fillable `['title','body','category_id','expires_at']`; casts `expires_at`/timestamps to `datetime`; `category()` belongsTo `Category` (withTrashed); SoftDeletes; `NotExpiredScope` applied globally.
  - `App\Models\Category` — fillable `['name']`; SoftDeletes; `tasks()` hasMany `Task` (withTrashed).
  - `App\Models\Scopes\NotExpiredScope` — hides rows where `expires_at` is in the past; keeps `null`.
  - `Database\Factories\TaskFactory`, `CategoryFactory` — default `expires_at = null`; `TaskFactory::expired()` state.

- [ ] **Step 1: Create the two models and the category factory** (needed for the scope test).

`app/Models/Category.php`:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Category extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = ['name'];

    public function tasks()
    {
        return $this->hasMany(Task::class)->withTrashed();
    }
}
```

`app/Models/Task.php`:
```php
<?php

namespace App\Models;

use App\Models\Scopes\NotExpiredScope;
use Illuminate\Database\Eloquent\Attributes\ScopedBy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

#[ScopedBy([NotExpiredScope::class])]
class Task extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = ['title', 'body', 'category_id', 'expires_at'];

    protected $with = ['category'];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function category()
    {
        return $this->belongsTo(Category::class)->withTrashed();
    }
}
```

`database/factories/CategoryFactory.php`:
```php
<?php

namespace Database\Factories;

use App\Models\Category;
use Illuminate\Database\Eloquent\Factories\Factory;

class CategoryFactory extends Factory
{
    protected $model = Category::class;

    public function definition(): array
    {
        return ['name' => fake()->unique()->word()];
    }
}
```

`database/factories/TaskFactory.php`:
```php
<?php

namespace Database\Factories;

use App\Models\Category;
use App\Models\Task;
use Illuminate\Database\Eloquent\Factories\Factory;

class TaskFactory extends Factory
{
    protected $model = Task::class;

    public function definition(): array
    {
        return [
            'category_id' => Category::factory(),
            'title' => fake()->unique()->sentence(3),
            'body' => fake()->sentence(),
            'expires_at' => null,
        ];
    }

    public function expired(): static
    {
        return $this->state(fn () => ['expires_at' => now()->subHour()]);
    }
}
```

- [ ] **Step 2: Write the failing scope test.**

`tests/Unit/NotExpiredScopeTest.php`:
```php
<?php

namespace Tests\Unit;

use App\Models\Task;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotExpiredScopeTest extends TestCase
{
    use RefreshDatabase;

    public function test_permanent_and_future_tasks_are_visible_expired_are_hidden(): void
    {
        $permanent = Task::factory()->create(['expires_at' => null]);
        $future = Task::factory()->create(['expires_at' => now()->addHour()]);
        $expired = Task::factory()->expired()->create();

        $ids = Task::query()->pluck('id');

        $this->assertTrue($ids->contains($permanent->id));
        $this->assertTrue($ids->contains($future->id));
        $this->assertFalse($ids->contains($expired->id));
    }
}
```

- [ ] **Step 3: Run it to verify it fails.**

Run: `php artisan test --filter=NotExpiredScopeTest`
Expected: FAIL — `Class "App\Models\Scopes\NotExpiredScope" not found`.

- [ ] **Step 4: Create the scope.**

`app/Models/Scopes/NotExpiredScope.php`:
```php
<?php

namespace App\Models\Scopes;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

class NotExpiredScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $builder->where(function (Builder $query) {
            $query->whereNull('expires_at')
                ->orWhere('expires_at', '>', now());
        });
    }
}
```

- [ ] **Step 5: Delete the legacy models.**

```bash
git rm app/Models/Notes.php app/Models/Categories.php app/Models/Base/BaseModel.php
```
Note: `BaseController.php`, `NotesController.php`, `CategoriesController.php` still reference these and will break the autoloader's static analysis but not runtime until called; they are deleted in Task 1.8. Tests in this task don't touch them.

- [ ] **Step 6: Run the test to verify it passes.**

Run: `php artisan test --filter=NotExpiredScopeTest`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
./vendor/bin/pint
git add -A
git commit -m "feat: add Task/Category models with NotExpired TTL scope"
```

### Task 1.3: Prune-expired command (TDD)

**Files:**
- Create: `app/Console/Commands/PruneExpiredTasks.php`
- Modify: `app/Console/Kernel.php`
- Create: `tests/Unit/PruneExpiredTasksTest.php`

**Interfaces:**
- Consumes: `Task` model + `expired()` factory state.
- Produces: artisan command `tasks:prune` that force-deletes rows with `expires_at < now()`.

- [ ] **Step 1: Write the failing test.**

`tests/Unit/PruneExpiredTasksTest.php`:
```php
<?php

namespace Tests\Unit;

use App\Models\Task;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PruneExpiredTasksTest extends TestCase
{
    use RefreshDatabase;

    public function test_prune_removes_only_expired_rows(): void
    {
        $keep = Task::factory()->create(['expires_at' => null]);
        $expired = Task::factory()->expired()->create();

        $this->artisan('tasks:prune')->assertExitCode(0);

        // Query raw table to bypass the global scope.
        $remaining = DB::table('tasks')->pluck('id');
        $this->assertTrue($remaining->contains($keep->id));
        $this->assertFalse($remaining->contains($expired->id));
    }
}
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `php artisan test --filter=PruneExpiredTasksTest`
Expected: FAIL — command `tasks:prune` is not defined.

- [ ] **Step 3: Create the command.**

`app/Console/Commands/PruneExpiredTasks.php`:
```php
<?php

namespace App\Console\Commands;

use App\Models\Task;
use Illuminate\Console\Command;

class PruneExpiredTasks extends Command
{
    protected $signature = 'tasks:prune';

    protected $description = 'Permanently delete tasks whose TTL has expired';

    public function handle(): int
    {
        $deleted = Task::withoutGlobalScopes()
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', now())
            ->forceDelete();

        $this->info("Pruned {$deleted} expired task(s).");

        return self::SUCCESS;
    }
}
```

- [ ] **Step 4: Register it in the scheduler.** In `app/Console/Kernel.php`, find the `schedule(Schedule $schedule)` method and set its body to:

```php
        $schedule->command('tasks:prune')->hourly();
```

- [ ] **Step 5: Run the test to verify it passes.**

Run: `php artisan test --filter=PruneExpiredTasksTest`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
./vendor/bin/pint
git add -A
git commit -m "feat: add tasks:prune command and hourly schedule"
```

### Task 1.4: Form Requests

**Files:**
- Create: `app/Http/Requests/StoreTaskRequest.php`, `UpdateTaskRequest.php`, `StoreCategoryRequest.php`, `UpdateCategoryRequest.php`
- Delete: `app/Http/Requests/NotesRequest.php`, `app/Http/Requests/CategoriesRequest.php`

**Interfaces:**
- Produces: request classes whose `validated()` returns sanitized `title/body/category_id` (tasks) or `name` (categories). `authorize()` returns `true`.

- [ ] **Step 1: Create the four request classes.**

`app/Http/Requests/StoreTaskRequest.php`:
```php
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
            'title' => ['required', 'string', 'max:255', Rule::unique('tasks', 'title')],
            'body' => ['required', 'string', 'max:1000'],
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
```

`app/Http/Requests/UpdateTaskRequest.php` (identical except the unique rule ignores the current row):
```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateTaskRequest extends FormRequest
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
                Rule::unique('tasks', 'title')->ignore($this->route('task')),
            ],
            'body' => ['required', 'string', 'max:1000'],
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
```

`app/Http/Requests/StoreCategoryRequest.php`:
```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255', Rule::unique('categories', 'name')],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'name' => is_string($this->name) ? strip_tags($this->name) : $this->name,
        ]);
    }
}
```

`app/Http/Requests/UpdateCategoryRequest.php`:
```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => [
                'required', 'string', 'max:255',
                Rule::unique('categories', 'name')->ignore($this->route('category')),
            ],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'name' => is_string($this->name) ? strip_tags($this->name) : $this->name,
        ]);
    }
}
```

- [ ] **Step 2: Delete the legacy requests.**

```bash
git rm app/Http/Requests/NotesRequest.php app/Http/Requests/CategoriesRequest.php
```

- [ ] **Step 3: Commit.**

```bash
./vendor/bin/pint
git add -A
git commit -m "feat: add Store/Update form requests for tasks and categories"
```

### Task 1.5: API Resources

**Files:**
- Create: `app/Http/Resources/TaskResource.php`, `app/Http/Resources/CategoryResource.php`

**Interfaces:**
- Produces:
  - `TaskResource` → `{ id, title, body, category: {id,name} | null, created_at, updated_at, expires_at }` (ISO strings).
  - `CategoryResource` → `{ id, name, created_at, updated_at }`.

- [ ] **Step 1: Create both resources.**

`app/Http/Resources/CategoryResource.php`:
```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CategoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
```

`app/Http/Resources/TaskResource.php`:
```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TaskResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'body' => $this->body,
            'category' => new CategoryResource($this->whenLoaded('category')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'expires_at' => $this->expires_at,
        ];
    }
}
```

- [ ] **Step 2: Commit.**

```bash
./vendor/bin/pint
git add -A
git commit -m "feat: add Task and Category API resources"
```

### Task 1.6: TaskController + routes (TDD)

**Files:**
- Create: `app/Http/Controllers/Api/V1/TaskController.php`
- Modify: `routes/api.php`
- Create: `tests/Feature/Api/V1/TaskApiTest.php`

**Interfaces:**
- Consumes: `Task`, `StoreTaskRequest`, `UpdateTaskRequest`, `TaskResource`, factories.
- Produces: routes `GET/POST /api/v1/tasks`, `GET/PUT/PATCH/DELETE /api/v1/tasks/{task}`; index supports `?category_id=` and `?trashed=only`; index is paginated (10/page); store sets `expires_at = now()+12h`.

- [ ] **Step 1: Write the failing feature test.**

`tests/Feature/Api/V1/TaskApiTest.php`:
```php
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
        $task = Task::factory()->create();

        $this->putJson("/api/v1/tasks/{$task->id}", [
            'category_id' => $task->category_id,
            'title' => 'Updated title',
            'body' => 'Updated body',
        ])->assertOk()->assertJsonPath('data.title', 'Updated title');
    }

    public function test_destroy_soft_deletes_and_returns_204(): void
    {
        $task = Task::factory()->create();

        $this->deleteJson("/api/v1/tasks/{$task->id}")->assertNoContent();
        $this->assertSoftDeleted('tasks', ['id' => $task->id]);
    }
}
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `php artisan test --filter=TaskApiTest`
Expected: FAIL — 404/route not defined for `/api/v1/tasks`.

- [ ] **Step 3: Create the controller.**

`app/Http/Controllers/Api/V1/TaskController.php`:
```php
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
        $task = Task::create($request->validated() + [
            'expires_at' => now()->addHours(12),
        ]);

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
        $task->update($request->validated());

        return TaskResource::make($task);
    }

    public function destroy(Task $task)
    {
        $task->delete();

        return response()->noContent();
    }
}
```

- [ ] **Step 4: Replace `routes/api.php`** with the versioned task routes (categories added next task):

```php
<?php

use App\Http\Controllers\Api\V1\TaskController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('tasks', [TaskController::class, 'index']);
    Route::get('tasks/{task}', [TaskController::class, 'show']);

    Route::middleware('throttle:api-write')->group(function () {
        Route::post('tasks', [TaskController::class, 'store']);
        Route::match(['put', 'patch'], 'tasks/{task}', [TaskController::class, 'update']);
        Route::delete('tasks/{task}', [TaskController::class, 'destroy']);
    });
});
```

- [ ] **Step 5: Run the test to verify it passes.**

Run: `php artisan test --filter=TaskApiTest`
Expected: PASS (all 9 cases). If route-model binding returns expired/trashed tasks unexpectedly, confirm the `NotExpiredScope` and SoftDeletes are both on the model.

- [ ] **Step 6: Commit.**

```bash
./vendor/bin/pint
git add -A
git commit -m "feat: add v1 tasks REST API with pagination, filtering and TTL"
```

### Task 1.7: CategoryController + routes (TDD)

**Files:**
- Create: `app/Http/Controllers/Api/V1/CategoryController.php`
- Modify: `routes/api.php`
- Create: `tests/Feature/Api/V1/CategoryApiTest.php`

**Interfaces:**
- Consumes: `Category`, `StoreCategoryRequest`, `UpdateCategoryRequest`, `CategoryResource`.
- Produces: routes `GET/POST /api/v1/categories`, `GET/PUT/PATCH/DELETE /api/v1/categories/{category}`; index paginated (10/page).

- [ ] **Step 1: Write the failing feature test.**

`tests/Feature/Api/V1/CategoryApiTest.php`:
```php
<?php

namespace Tests\Feature\Api\V1;

use App\Models\Category;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CategoryApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_lists_categories(): void
    {
        Category::factory()->count(3)->create();

        $this->getJson('/api/v1/categories')
            ->assertOk()
            ->assertJsonStructure(['data', 'links', 'meta'])
            ->assertJsonCount(3, 'data');
    }

    public function test_store_creates_category(): void
    {
        $this->postJson('/api/v1/categories', ['name' => 'Errands'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Errands');

        $this->assertDatabaseHas('categories', ['name' => 'Errands']);
    }

    public function test_store_requires_unique_name(): void
    {
        Category::factory()->create(['name' => 'Work']);

        $this->postJson('/api/v1/categories', ['name' => 'Work'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('name');
    }

    public function test_show_missing_returns_404(): void
    {
        $this->getJson('/api/v1/categories/999')->assertNotFound();
    }

    public function test_update_changes_name(): void
    {
        $category = Category::factory()->create();

        $this->putJson("/api/v1/categories/{$category->id}", ['name' => 'Renamed'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Renamed');
    }

    public function test_destroy_soft_deletes_and_returns_204(): void
    {
        $category = Category::factory()->create();

        $this->deleteJson("/api/v1/categories/{$category->id}")->assertNoContent();
        $this->assertSoftDeleted('categories', ['id' => $category->id]);
    }
}
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `php artisan test --filter=CategoryApiTest`
Expected: FAIL — `/api/v1/categories` not defined.

- [ ] **Step 3: Create the controller.**

`app/Http/Controllers/Api/V1/CategoryController.php`:
```php
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
        return CategoryResource::collection(Category::latest()->paginate(10));
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
        $category->delete();

        return response()->noContent();
    }
}
```

- [ ] **Step 4: Add category routes to `routes/api.php`** inside the existing `v1` group. The full file becomes:

```php
<?php

use App\Http\Controllers\Api\V1\CategoryController;
use App\Http\Controllers\Api\V1\TaskController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('tasks', [TaskController::class, 'index']);
    Route::get('tasks/{task}', [TaskController::class, 'show']);
    Route::get('categories', [CategoryController::class, 'index']);
    Route::get('categories/{category}', [CategoryController::class, 'show']);

    Route::middleware('throttle:api-write')->group(function () {
        Route::post('tasks', [TaskController::class, 'store']);
        Route::match(['put', 'patch'], 'tasks/{task}', [TaskController::class, 'update']);
        Route::delete('tasks/{task}', [TaskController::class, 'destroy']);

        Route::post('categories', [CategoryController::class, 'store']);
        Route::match(['put', 'patch'], 'categories/{category}', [CategoryController::class, 'update']);
        Route::delete('categories/{category}', [CategoryController::class, 'destroy']);
    });
});
```

- [ ] **Step 5: Run the test to verify it passes.**

Run: `php artisan test --filter=CategoryApiTest`
Expected: PASS (all 6 cases).

- [ ] **Step 6: Commit.**

```bash
./vendor/bin/pint
git add -A
git commit -m "feat: add v1 categories REST API"
```

### Task 1.8: Remove legacy controllers and bespoke routes

**Files:**
- Delete: `app/Http/Controllers/NotesController.php`, `app/Http/Controllers/CategoriesController.php`, `app/Http/Controllers/Base/BaseController.php`
- Delete: `tests/Feature/SmokeTest.php` (its legacy endpoint is gone)
- Delete: `tests/Feature/ExampleTest.php`, `tests/Unit/ExampleTest.php` (stock stubs)

- [ ] **Step 1: Delete legacy code and stub tests.**

```bash
git rm app/Http/Controllers/NotesController.php \
       app/Http/Controllers/CategoriesController.php \
       app/Http/Controllers/Base/BaseController.php \
       tests/Feature/SmokeTest.php \
       tests/Feature/ExampleTest.php \
       tests/Unit/ExampleTest.php
```

- [ ] **Step 2: Confirm no dangling references.**

Run: `grep -rn "Notes\b\|Categories\b\|BaseController\|showAll\|deleteAll" app routes`
Expected: no matches in `app/` or `routes/` (the only remaining `Notes`/`Categories` strings should be none). Fix any that appear.

- [ ] **Step 3: Run the full suite.**

Run: `php artisan test`
Expected: PASS — only `TaskApiTest`, `CategoryApiTest`, `NotExpiredScopeTest`, `PruneExpiredTasksTest` remain, all green.

- [ ] **Step 4: Commit.**

```bash
./vendor/bin/pint
git add -A
git commit -m "refactor: remove legacy controllers, bespoke routes and stub tests"
```

### Task 1.9: Update seeders for the new schema

**Files:**
- Rename: `database/seeders/NotesSeeder.php` → `database/seeders/TaskSeeder.php`
- Modify: `database/seeders/TaskSeeder.php` (target `tasks` table), `database/seeders/DatabaseSeeder.php`
- `database/seeders/CategoriesSeeder.php` unchanged (still targets `categories`).

**Interfaces:**
- Produces: seeded permanent (`expires_at = null`) categories + tasks, including soft-deleted history rows.

- [ ] **Step 1: Rename the seeder file and class.**

```bash
git mv database/seeders/NotesSeeder.php database/seeders/TaskSeeder.php
```

- [ ] **Step 2: In `database/seeders/TaskSeeder.php`** rename the class to `TaskSeeder` and change every `DB::table('notes')` to `DB::table('tasks')`. Leave the data arrays as-is (they already use `category_id`, `title`, `body`, `created_at`, `deleted_at`). Do **not** set `expires_at` — leaving it absent inserts SQL `NULL`, marking seed data permanent.

The class declaration line becomes:
```php
class TaskSeeder extends Seeder
```
and both insert blocks use:
```php
            DB::table('tasks')->insert([
```

- [ ] **Step 3: Update `database/seeders/DatabaseSeeder.php`** to call the renamed seeder:

```php
        $this->call([
            CategoriesSeeder::class,
            TaskSeeder::class,
        ]);
```

- [ ] **Step 4: Verify a fresh seed and TTL semantics.**

Run:
```bash
php artisan migrate:fresh --seed
php artisan tinker --execute="echo \App\Models\Task::count().' visible; '.\Illuminate\Support\Facades\DB::table('tasks')->whereNull('expires_at')->count().' permanent';"
```
Expected: prints `13 visible; 15 permanent` (13 active visible through the scope; 15 total rows all permanent, 2 of which are soft-deleted so excluded from the visible count).

- [ ] **Step 5: Commit.**

```bash
./vendor/bin/pint
git add -A
git commit -m "refactor: rename NotesSeeder to TaskSeeder and target tasks table"
```

### Task 1.10: Full-suite gate + Pint

- [ ] **Step 1: Run the entire test suite.**

Run: `php artisan test`
Expected: all tests pass, zero failures.

- [ ] **Step 2: Run Pint in test mode.**

Run: `./vendor/bin/pint --test`
Expected: "no style issues" (if it reports fixable issues, run `./vendor/bin/pint` and commit).

- [ ] **Step 3: Tag the checkpoint.**

```bash
git commit --allow-empty -m "chore: CP1 complete — RESTful v1 API green"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** SQLite swap (0.1), drop Redis (0.1), slim Sail (0.3), dep update (0.4), baseline browser validation (0.5), rename Notes→Task (1.1/1.2/1.9), `/api/v1` resourceful routes (1.6/1.7), API Resources (1.5), pagination (1.6/1.7 tests), status codes + error envelope (Handler already implements the envelope; verified by 1.6/1.7 422/404/204 assertions), Categories as resource (1.7), TTL column+scope+prune+schedule (1.1/1.2/1.3), PHPUnit harness + factories (0.2/1.2). Error-envelope code already exists in `app/Exceptions/Handler.php` from prior work, so no new task is needed — only the assertions in 1.6/1.7 exercise it.
- **Deferred to the frontend plan (CP2–CP4):** Tailwind design system, view rebuild on `/api/v1`, Vitest/RTL, README/`.env.example` doc rewrite, prod Docker/nginx reconciliation, Lighthouse/a11y. These require the locked visual direction and are out of scope here.
- **Placeholder scan:** none — every code/test step contains full content.
- **Type consistency:** `Task`/`Category` model names, `expires_at`, `NotExpiredScope`, `tasks:prune`, request class names, and resource shapes are used identically across tasks 1.1–1.9.

## Notes for the frontend plan (to be written after CP1)

- API base path changed to `/api/v1`; response shape is now `{ data, links, meta }` (paginated) and `{ data: {...} }` (single). The front-end API client must adapt.
- History is `GET /api/v1/tasks?trashed=only`; category filter is `?category_id=`.
- Delete returns 204 (no body); create returns 201 with the resource.
