# Daybook — Modernization Design

**Date:** 2026-06-27
**Status:** Approved (design); pending implementation plan

## 1. Purpose & Goals

Modernize the existing Laravel 12 / React 18 Daybook into a clean reference
example of a CRUD application that follows popular conventions, while drastically reducing
its infrastructure footprint.

Three driving goals:

1. **Working baseline first.** Update dependencies and get the app running in a verifiable
   state (validated in a real browser via Chrome MCP) before any refactor.
2. **Conventional CRUD API.** Reshape the API to standard RESTful/Laravel conventions so the
   project reads as a textbook example.
3. **Fewer deployed services.** Remove backing services that require separate deployment
   (MySQL, Redis). Persistence is not a hard requirement; user-created data may expire.
4. **Front-end revamp.** Replace the React-Bootstrap UI with a distinctive Tailwind-based
   custom design system.
5. **Introduce automated testing** as the gate between every checkpoint. The project currently
   has no real tests.

## 2. Key Decisions (confirmed with user)

| Decision | Choice | Rationale |
|---|---|---|
| Datastore | **SQLite (embedded file)** | Zero DB service; Eloquent unchanged so CRUD conventions still apply. Chosen over MongoDB/Redis because the deeper goal is *fewer deployed services*, and SQLite needs none. |
| Caching/queue/session | **Drop Redis** | `cache=database`, `queue=database`, `session=file`. Removes the second backing service. |
| Dev runtime | **Native `php artisan serve` primary; Sail slimmed to a single app container** | From 2 required services → 0. |
| Core model | **Rename `Notes` → `Task`** (singular) | Matches the app's purpose and Laravel singular-model convention. |
| API style | **Versioned resourceful REST** under `/api/v1` | Standard `apiResource` routes replace bespoke `/showAll`, `/create`, `/edit`. |
| API output | **API Resources + pagination** | Transformers and paginated index responses instead of raw Eloquent models. |
| API errors | **Proper status codes + JSON error envelope** | 201/204/422/404 replacing ad-hoc string responses. |
| Categories | **Kept as a full CRUD resource** | Tasks filterable by category; relationship preserved. |
| Front-end | **Tailwind CSS + small custom component set** | Distinctive, non-templated look. React 18 + React Router retained. |
| Backend tests | **PHPUnit** (already wired) | Less churn than switching to Pest. |
| Front-end tests | **Vitest + React Testing Library** | Standard modern React testing. |
| TTL | **`expires_at` column + global scope + scheduled prune** | 12h expiry on user data; seeded data permanent. No external service. |

## 3. Architecture

### 3.1 Data model

Two tables, unchanged shape except a new TTL column and corrected naming:

- `categories`: `id`, `name`, timestamps, `deleted_at` (soft delete).
- `tasks` (renamed from `notes`; migration filename typo `make_motes_table` fixed):
  `id`, `category_id` (FK), `title`, `body`, timestamps, `deleted_at`, **`expires_at` (nullable)**.

Models: `App\Models\Task`, `App\Models\Category` (singular). The non-conventional
`App\Models\Base\BaseModel` magic is removed; shared behavior (soft deletes, datetime casts,
TTL scope) lives in traits/explicit model code.

**TTL semantics:**
- Seeded rows → `expires_at = null` → permanent.
- User-created rows → `expires_at = now()->addHours(12)`.
- A global scope (`ExpiresAtScope`) excludes rows where `expires_at` is in the past.
- `php artisan tasks:prune` (and `categories:prune`, or one combined command) hard-deletes
  expired rows; registered in the scheduler (`hourly`). Documented as opt-in (`schedule:work`)
  since there is no required cron service in the slim setup.

### 3.2 API surface (`/api/v1`)

Resourceful controllers (`TaskController`, `CategoryController`) using `apiResource`:

| Verb | Path | Action | Success |
|---|---|---|---|
| GET | `/api/v1/tasks` | index (paginated, `?category_id=`, `?trashed=only` for history) | 200 |
| POST | `/api/v1/tasks` | store | 201 |
| GET | `/api/v1/tasks/{task}` | show | 200 |
| PUT/PATCH | `/api/v1/tasks/{task}` | update | 200 |
| DELETE | `/api/v1/tasks/{task}` | destroy (soft) | 204 |
| GET | `/api/v1/categories` | index | 200 |
| POST | `/api/v1/categories` | store | 201 |
| GET | `/api/v1/categories/{category}` | show | 200 |
| PUT/PATCH | `/api/v1/categories/{category}` | update | 200 |
| DELETE | `/api/v1/categories/{category}` | destroy (soft) | 204 |

- **History** (`onlyTrashed`) exposed via `?trashed=only` on the index (conventional) rather
  than a one-off `/history` endpoint.
- **Bulk delete** (`deleteAll`) retired unless a clear conventional need remains; if kept,
  modeled as `DELETE /api/v1/tasks` guarded.
- Responses use **API Resource** classes (`TaskResource`, `CategoryResource`). Index is paginated.
- Validation via `StoreTaskRequest`/`UpdateTaskRequest` (and category equivalents); the
  redundant `validateRequest()` indirection is removed (FormRequest auto-validates).
- Errors: Laravel's default 422 validation shape plus a consistent JSON envelope for
  404/500 via the exception handler.
- Rate limiting (`throttle:api`, `throttle:api-write`) retained at the Laravel layer.

### 3.3 Front-end

- Remove `react-bootstrap`, `react-router-bootstrap`, `bootstrap`, `sass`. Add **Tailwind CSS**
  (+ PostCSS/autoprefixer) and a tokens file (colors, spacing, typography, radius, shadow).
- Small hand-built component library under `resources/js/components/ui/`:
  `Button`, `Card`, `Input`, `Select`, `Textarea`, `Table`/`List`, `Badge`, `Toast`, `Spinner`,
  `Layout`, `Navbar`.
- Feature views rebuilt against `/api/v1`: task list, task create/edit/show, category
  list/create/edit/show, history. `react-toastify` may stay or be replaced by the custom Toast.
- Visual direction locked via mockups (frontend-design skill + browser companion) before build.
- An API client module wraps axios with the `/api/v1` base URL, pagination, and error handling.

### 3.4 Infrastructure

- `docker-compose.yml` (Sail): reduce to a single app service; remove `mysql` and `redis`
  services, volumes, and `depends_on`.
- `docker-compose.prod.yml` / `Dockerfile`: remove `pdo_mysql`/`redis` extensions and the
  MySQL/Redis services; switch to `pdo_sqlite`. (Confirm at CP4 whether to keep prod Docker at
  all, or trim to a minimal example.)
- `.env.example`: `DB_CONNECTION=sqlite`, drop MySQL/Redis/Pusher/Memcached blocks, set
  `CACHE_STORE=database`, `SESSION_DRIVER=file`, `QUEUE_CONNECTION=database`.
- Nginx rate-limit zones reference legacy `create|edit|delete` path patterns; update to match
  new RESTful verbs/paths (or rely on Laravel throttling and simplify nginx).

## 4. Testing Strategy (the checkpoint gateway)

**Backend (PHPUnit):**
- Test DB: in-memory SQLite (`:memory:`) via `phpunit.xml` env.
- Model factories: `TaskFactory`, `CategoryFactory`.
- Feature tests per endpoint: index (+pagination, +filter, +history), show, store (201 + 422),
  update (200 + 422 + 404), destroy (204 + 404).
- Unit tests: TTL global scope (hides expired, keeps permanent), prune command (deletes expired
  only), model relationships/casts.

**Front-end (Vitest + React Testing Library):**
- UI component tests (render, variants, interaction).
- View integration tests with a mocked API client (list renders rows, create posts, validation
  errors surface, delete confirms + refetches).

**Browser (Chrome MCP):**
- CP0: load the working baseline UI, confirm data renders.
- CP3/CP4: end-to-end walkthrough (create → edit → delete → history) with screenshots; Lighthouse
  audit for performance/accessibility.

## 5. Checkpoints

Each checkpoint is **gated**: its tests (and Pint/build) must be green before the next begins.

### CP0 — Working baseline on SQLite
- Update composer & npm dependencies to current stable.
- Swap MySQL→SQLite, drop Redis, rewire `.env.example`/config, slim Sail.
- `php artisan migrate:fresh --seed` succeeds; legacy app boots.
- **Gate:** migrate+seed clean, a backend smoke test green, `pint` clean, **Chrome MCP loads the
  current UI and shows seeded data**.

### CP1 — API redesign (TDD)
- Introduce PHPUnit harness + factories.
- Rename Notes→Task; singular models; remove BaseController magic.
- `/api/v1` resourceful routes, FormRequests, API Resources, pagination, status codes, error
  envelope; Categories as resource; `expires_at` + scope + prune command + scheduler.
- **Gate:** full backend feature + unit suite green; `pint` clean.

### CP2 — Design system foundation
- Remove React-Bootstrap; add Tailwind + tokens; build base UI component set.
- Lock visual direction via mockups.
- Vitest + RTL set up.
- **Gate:** component tests green; `npm run build` succeeds.

### CP3 — Feature rebuild on new API
- Rebuild all views against `/api/v1` with the new design system + API client.
- **Gate:** front-end view/integration tests green; **Chrome MCP walkthrough** (create/edit/
  delete/history) passes with screenshots.

### CP4 — Polish, docs, final validation
- Rewrite README + `.env.example` for the new stack; reconcile/trim `Dockerfile` &
  `docker-compose.prod.yml` & nginx; accessibility pass.
- **Gate:** full backend + front-end suites green; Lighthouse thresholds met; final Chrome MCP
  walkthrough.

## 6. Out of Scope / YAGNI

- Authentication (Sanctum stays installed but unused; remains a single-user demo).
- Real-time/broadcasting (Pusher/Echo already commented out — remove dead config).
- Terraform/AWS deployment automation (README references it; not present in repo — README will
  be corrected to reality).
- Multi-user data isolation, role permissions, file uploads.

## 7. Risks & Notes

- **TTL without a guaranteed scheduler:** the global scope hides expired rows immediately even
  if prune hasn't run, so correctness doesn't depend on the cron. Prune is housekeeping only.
- **Rename blast radius:** Notes→Task touches models, migrations, routes, seeders, factories,
  and every front-end component; done wholesale in CP1/CP3, guarded by tests.
- **SQLite vs NoSQL:** user explicitly chose SQLite over NoSQL after the trade-off was named;
  recorded here to avoid re-litigation.
