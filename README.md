# Daybook

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Laravel 12](https://img.shields.io/badge/laravel-12-FF2D20?logo=laravel&logoColor=white)](composer.json)
[![React 18](https://img.shields.io/badge/react-18-61DAFB?logo=react&logoColor=black)](package.json)

Daybook is a to-do list built around one opinionated idea: **a day's tasks are ephemeral**. A task you add lives for **12 hours** and then quietly expires; the ones that matter are explicitly **kept**, which makes them permanent *and* locks them against accidental edits and deletes. The UI makes time a first-class dimension — every ephemeral task carries a live depleting time bar, while kept tasks wear a padlock chip (warm = fleeting, cool = anchored).

Underneath it is a full-stack reference app with an unusually small operational surface: a Laravel 12 REST API and a custom-designed React frontend, both fully tested, on a **zero-extra-service** stack — one SQLite file, no MySQL, no Redis, one container. The part worth reading the code for is where the TTL is enforced. Expiry is a **global Eloquent scope**, not a cron job, so an expired task vanishes from every query and 404s through route-model binding the instant it lapses; the hourly `tasks:prune` command only reclaims rows. Correctness never depends on the scheduler having run.

![Daybook's Today view: a newly created task showing its live 12-hour time bar, above kept tasks wearing padlock chips](docs/design/cp3-created.png)

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Laravel 12, PHP 8.4 |
| Database | **SQLite** (single file; queue and cache on the `database` connection, sessions on the filesystem) |
| Frontend | React 18, React Router 7, **Tailwind CSS 3**, Vite 6 |
| API client | axios wrapper over `/api/v1` |
| Backend tests | PHPUnit 11 (in-memory SQLite) |
| Frontend tests | Vitest 2 + React Testing Library (jsdom) |
| Tooling | Laravel Sail (Docker), Laravel Pint |

There are **no MySQL or Redis services** — the app runs against a single SQLite file, so a dev or prod environment needs only the app container.

One deliberate note for anyone reading the tree: this project runs Laravel 12 on the **legacy skeleton layout** (`app/Http/Kernel.php`, `app/Console/Kernel.php`, a `RouteServiceProvider` registered in `config/app.php`) rather than the slim `bootstrap/app.php` style. Middleware, rate limiters, and the schedule therefore live where a Laravel 10 developer would look for them.

## Features

- **REST CRUD API** for tasks and categories under `/api/v1`, with API Resources, pagination, explicit status codes (200/201/204/409/422/423/404), and a consistent JSON error envelope. Routes are declared explicitly rather than via `apiResource` — the surface is exactly the ten routes listed below, no `PATCH`, no route names.
- **12-hour TTL with an opt-out**: tasks created through the API get `expires_at = now + 12h` unless created with `kept: true`, which stores `expires_at = null` and makes them permanent.
- **Kept means locked.** A kept task refuses `PUT` and `DELETE` with **423 Locked**; the single permitted write is the unlock itself (`kept: false`), which starts a fresh 12-hour window. Permanence you can set by accident is not permanence.
- **Expiry is a global scope, not a job**: `NotExpiredScope` hides lapsed tasks from every query immediately; `tasks:prune` (scheduled hourly) force-deletes them afterwards.
- **Soft deletes** with a History / recycle-bin view (`?trashed=only`).
- **Categories** as a full CRUD resource, each exposing an active `tasks_count`. Deleting a category that still holds open tasks returns **409 Conflict** rather than orphaning them.
- **Rate limiting** at two layers: 60 req/min general and 15 req/min for writes in Laravel, plus an independent nginx limit in the production image.
- **Daybook design system** — a hand-built Tailwind component library (no UI framework), with a signature per-task time bar, accessibility-tuned contrast tokens, and a meta description and favicon.
- **Tests as a gate**: 38 backend feature/unit tests, 38 frontend component/integration tests.

## Screenshots

| | |
|---|---|
| ![The Categories view: colored dot plus name per category, with a New category action](docs/design/cp4-categories.png) | ![The History view: soft-deleted tasks, faded, struck through, and read-only](docs/design/cp3-history.png) |
| **Categories** — full CRUD, each row carrying its color token. | **History** — the recycle bin, read-only by design. |

## Quick start (Laravel Sail)

Prerequisites: Docker (or Podman) and Docker Compose. Everything else runs inside the Sail container.

```bash
# 1. Get the Sail binary (one-off; uses your host Composer, or a Composer container)
composer install

# 2. Environment
cp .env.example .env

# 3. Start the single app container
./vendor/bin/sail up -d

# 4. Inside the container: app key, dependencies, database, assets
./vendor/bin/sail artisan key:generate
./vendor/bin/sail composer install
./vendor/bin/sail npm install
./vendor/bin/sail artisan migrate:fresh --seed
./vendor/bin/sail npm run build      # or: ./vendor/bin/sail npm run dev
```

`.env.example` ships `APP_PORT=8080`, so after step 2 the app is at **http://localhost:8080**. Change `APP_PORT` in `.env` to move it; if unset, Compose falls back to port 80.

> **Rootless Podman / SELinux (Fedora, etc.):** the bind-mounted project is owned by your host user, which maps to container UID 0 under rootless Podman, so the default `sail` user cannot write to it. Run the app as root inside the container (the officially documented Sail fix) by adding a local, git-ignored `docker-compose.override.yml`:
> ```yaml
> services:
>   laravel.test:
>     environment:
>       SUPERVISOR_PHP_USER: 'root'
> ```
> and `APP_USER=root` in your `.env` (so `sail` CLI commands also run as root). The committed `docker-compose.yml` already adds `:z` to the bind mount for SELinux relabeling.

## The API

All routes are under `/api/v1` and return JSON. List endpoints return `{ data, links, meta }` (paginated, 10 per page); single-resource endpoints return `{ data }`. Write routes carry the stricter `throttle:api-write` limit.

### Tasks

| Method | Path | Description | Success |
|---|---|---|---|
| GET | `/api/v1/tasks` | List active tasks, newest first. Query: `?category_id=`, `?trashed=only` (history), `?page=` | 200 |
| POST | `/api/v1/tasks` | Create a task (`kept: true` for permanent; otherwise `expires_at = now + 12h`) | 201 |
| GET | `/api/v1/tasks/{task}` | Show a task (expired/soft-deleted → 404 via the global scope) | 200 |
| PUT | `/api/v1/tasks/{task}` | Full update. **423** if the task is kept, unless the payload unlocks it with `kept: false` | 200 |
| DELETE | `/api/v1/tasks/{task}` | Soft delete. **423** if the task is kept — unlock it first | 204 |

### Categories

| Method | Path | Description | Success |
|---|---|---|---|
| GET | `/api/v1/categories` | List categories (each includes active `tasks_count`) | 200 |
| POST | `/api/v1/categories` | Create a category | 201 |
| GET | `/api/v1/categories/{category}` | Show a category | 200 |
| PUT | `/api/v1/categories/{category}` | Update | 200 |
| DELETE | `/api/v1/categories/{category}` | Soft delete. **409** if open tasks still reference it | 204 |

Validation failures return `422` with `{ message, errors }`; missing resources return `404` with `{ message }`; unexpected errors return a generic `500` message (no stack traces).

### The 12-hour TTL

- A nullable `tasks.expires_at` timestamp drives everything, and `null` is the permanent state. **API-created tasks** get `now()->addHours(12)` unless the request carries `kept: true`. The demo seeder creates a realistic mix of kept tasks and countdowns at varied remaining times.
- `App\Models\Scopes\NotExpiredScope` is attached to `Task` with `#[ScopedBy]` and excludes rows whose `expires_at` is in the past, so expired tasks disappear from every query — and route-model binding 404s them — **even before pruning runs**. Correctness never depends on the scheduler.
- Unlocking is the one write a kept task accepts: `kept: false` sets `expires_at` to a fresh `now() + 12h`. A task that already has a deadline keeps the deadline it had rather than having its clock reset.
- `php artisan tasks:prune` force-deletes expired rows (bypassing the global scope) and is registered `hourly()` in `app/Console/Kernel.php`. Run the scheduler with `./vendor/bin/sail artisan schedule:work` if you want pruning locally; it is housekeeping only.

## Project structure

```
app/
  Console/
    Commands/PruneExpiredTasks.php            # tasks:prune
    Kernel.php                                # schedules tasks:prune hourly()
  Exceptions/Handler.php                      # JSON error envelope for /api/*
  Http/
    Kernel.php                                # middleware groups; throttle:api on the api group
    Controllers/Api/V1/                       # TaskController, CategoryController
    Requests/                                 # Store/Update Task & Category form requests
    Resources/                                # TaskResource, CategoryResource
  Models/
    Task.php  Category.php                    # singular Eloquent models, SoftDeletes
    Scopes/NotExpiredScope.php                # the TTL global scope
  Providers/RouteServiceProvider.php          # api (60/min) / api-write (15/min) rate limiters
database/
  migrations/                                 # categories, tasks (+expires_at), cache, jobs
  factories/  seeders/                        # TaskFactory/CategoryFactory; demo seed data
routes/
  api.php                                     # the ten /api/v1 task + category routes
  web.php                                     # SPA catch-all -> welcome view
resources/
  js/
    lib/{api.js,time.js}                      # API client + TTL math (describeExpiry)
    components/ui/                            # Button, Card, inputs, Badge, Spinner, EmptyState,
                                              #   TimeBar, KeptChip, CategoryTag (design system)
    components/layout/{AppShell,Rail}.jsx     # the daybook shell + left rail
    features/tasks/                           # TaskList, TaskRow, TaskForm, TaskDetail
    features/categories/                      # CategoryList, CategoryForm, CategoryDetail
    features/history/HistoryView.jsx          # soft-deleted tasks (read-only)
    AppData.jsx  Index.jsx                    # categories context + router (createRoot)
    test/setup.js                             # Testing Library / jsdom setup
  css/app.css                                 # Tailwind layers + TTL-bar utilities/keyframes
tailwind.config.js  postcss.config.cjs        # Daybook design tokens
vitest.config.js                              # jsdom test env (separate from vite.config.js)
tests/
  Feature/Api/V1/{TaskApiTest,CategoryApiTest}.php
  Unit/{NotExpiredScopeTest,PruneExpiredTasksTest}.php
docker/
  nginx.conf  supervisord.conf                # production image: nginx + php-fpm under supervisor
  reset-demo-data.sh                          # re-seed the demo database
Dockerfile
docker-compose.yml                            # Laravel Sail (development)
docker-compose.prod.yml                       # single production container + sqlite-data volume
docs/
  design/                                     # cp3-*/cp4-* walkthrough screenshots, daybook-mockup.html
  FOLLOWUPS.md                                # deferred items and known notes
```

## Frontend views

- **Today** (`/`) — the day's tasks; each shows a depleting time bar (ephemeral) or a Kept chip (permanent). Category filter and "load more" pagination.
- **New / Edit task** (`/tasks/create`, `/tasks/:id/edit`) — title, category, details, with inline `422` field errors.
- **Task detail** (`/tasks/:id`).
- **Categories** (`/categories`, `/categories/create`, `/categories/:id`, `/categories/:id/edit`).
- **History** (`/history`) — soft-deleted tasks, faded and read-only.
- A client-side catch-all renders a Not Found view; `routes/web.php` serves the SPA shell for any non-API path.

## Running the tests

```bash
# Backend (PHPUnit, in-memory SQLite) — 38 tests
./vendor/bin/sail test

# Frontend (Vitest + React Testing Library, jsdom) — 38 tests
./vendor/bin/sail npm run test:run

# Lint/format
./vendor/bin/sail php vendor/bin/pint
```

There is no CI workflow in this repository; the commands above are the gate.

## Production notes

`Dockerfile` and `docker-compose.prod.yml` build a single app container (nginx + php-fpm under supervisor, PHP 8.4, `pdo_sqlite`, assets built with Node during the image build). The SQLite file is persisted in the `sqlite-data` named volume mounted at `/var/www/html/database`.

Because that volume shadows the file baked into the image, **run `php artisan migrate --force` (and optionally `--seed`) on the first deploy** to initialize the database in the volume. The same shadowing applies to `database/migrations` and `database/seeders` — after changing them, copy them into the container before reseeding:

```bash
docker compose -f docker-compose.prod.yml cp database/seeders/. app:/var/www/html/database/seeders/
```

See [docs/FOLLOWUPS.md](docs/FOLLOWUPS.md) for the details and the planned fix. `docker/reset-demo-data.sh` resets the demo database to the seeded state (suitable for a daily cron); it targets the container name `daybook-app-1`, so adjust it if your project name differs.

## License

[MIT](LICENSE) © 2026 Andres Perez.
