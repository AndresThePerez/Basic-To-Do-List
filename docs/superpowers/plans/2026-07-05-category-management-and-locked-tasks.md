# Category Management & Locked Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make category filtering clearable, restore access to category management, make kept ("locked") tasks immutable with an explicit unlock path, and guard category deletion against active use.

**Architecture:** Backend adds two guards to existing V1 controllers (423 Locked on kept-task mutation, 409 Conflict on in-use category deletion) — no new routes, no schema changes; categories are already soft-deleted and History rows already resolve trashed categories via `withTrashed`. Frontend adds rail navigation affordances (All tasks, Manage categories), a clear-filter chip on Today, muted locked rows with hidden actions, and an Unlock action on the task detail page.

**Tech Stack:** PHP 8.4, Laravel 12, SQLite, PHPUnit 11, React 18, Vitest, Tailwind.

## Context (read first)

- A task is **kept/locked** when `expires_at === null`. The lock badge is `resources/js/components/ui/KeptChip.jsx` (teal `#2F6F7E` = Tailwind token `kept`, tints `#EAF3F4` bg / `#BFD6DC` border).
- `Task` carries the `NotExpiredScope` global scope, so any relation query on tasks automatically excludes expired rows.
- `Category::tasks()` is `hasMany(Task::class)->withTrashed()` — it removes only the soft-delete scope; `NotExpiredScope` still applies. Therefore `->whereNull('deleted_at')` on that relation yields exactly the "active" set (open, non-history, non-expired).
- The category management pages (`/categories`, create/edit/detail) all exist and are routed in `resources/js/Index.jsx` — they are only missing a navigation entry point. Do not rebuild them.
- **Unlock semantics (decided with Andres):** a locked task rejects update/delete; the one allowed mutation is an update whose payload contains `kept: false`, which unlocks it and starts a fresh 12h countdown (the existing `update()` logic already sets `expires_at = now()+12h` in that case). Unlock is surfaced as a confirm-guarded button on the task detail page.

## Global Constraints

- PHP `^8.4`, Laravel `^12.0`; SQLite only; all API routes stay under `/api/v1`.
- Success codes: index/show/update → 200, store → 201, destroy → 204. Validation → 422, missing → 404. **New:** locked mutation → 423, in-use category delete → 409.
- **Runtime is Sail (Docker), not host PHP:** `php artisan X` = `./vendor/bin/sail artisan X`, `php artisan test` = `./vendor/bin/sail test`, pint = `./vendor/bin/sail php vendor/bin/pint`, npm = `./vendor/bin/sail npm X`. Container must be up (`./vendor/bin/sail up -d`). On this rootless-Docker host the git-ignored `docker-compose.override.yml` (`SUPERVISOR_PHP_USER: root`) must exist — see `docs/FOLLOWUPS.md`.
- Frontend tests: `./vendor/bin/sail npm run test:run`.
- Run pint before every commit; commit after every task with Conventional Commit prefixes.
- Never add Co-Authored-By or AI references to commits.

---

## File Structure

- Modify: `app/Http/Controllers/Api/V1/TaskController.php` (lock guards)
- Modify: `app/Http/Controllers/Api/V1/CategoryController.php` (destroy guard)
- Modify: `resources/js/components/layout/Rail.jsx` (All tasks + Manage categories)
- Modify: `resources/js/features/tasks/TaskList.jsx` (clear-filter chip, legend icon)
- Modify: `resources/js/features/tasks/TaskRow.jsx` (muted locked row, hidden actions)
- Modify: `resources/js/features/tasks/TaskDetail.jsx` (Unlock action)
- Modify: `resources/js/features/tasks/TaskForm.jsx` (locked notice on direct /edit visit)
- Modify: `resources/js/features/categories/CategoryDetail.jsx` (Delete with 409 handling)
- Tests: `tests/Feature/Api/V1/TaskApiTest.php`, `tests/Feature/Api/V1/CategoryApiTest.php`, `resources/js/components/layout/Rail.test.jsx`, `resources/js/features/tasks/TaskList.test.jsx`, `resources/js/features/tasks/TaskDetail.test.jsx`, `resources/js/features/tasks/TaskForm.test.jsx`

---

### Task 1: Backend — locked (kept) tasks reject edit & delete

**Files:**
- Modify: `app/Http/Controllers/Api/V1/TaskController.php`
- Test: `tests/Feature/Api/V1/TaskApiTest.php`

**Interfaces:**
- Produces: `PUT /api/v1/tasks/{id}` → 423 when task is kept and payload lacks `kept: false`; `DELETE /api/v1/tasks/{id}` → 423 when kept. Unlock = full update payload + `kept: false` → 200 with non-null `expires_at`.

- [ ] **Step 1: Write the failing tests** — append to `TaskApiTest`:

```php
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
```

- [ ] **Step 2: Run to verify failure** — `./vendor/bin/sail test --filter=TaskApiTest` → the three new tests FAIL (200/204 instead of 423).

- [ ] **Step 3: Implement the guards** in `TaskController`:

```php
public function update(UpdateTaskRequest $request, Task $task)
{
    $unlocking = $request->has('kept') && ! $request->boolean('kept');

    if ($task->expires_at === null && ! $unlocking) {
        abort(Response::HTTP_LOCKED, 'This task is kept and locked. Unlock it first.');
    }

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
    if ($task->expires_at === null) {
        abort(Response::HTTP_LOCKED, 'Kept tasks are locked and cannot be deleted. Unlock the task first.');
    }

    $task->delete();

    return response()->noContent();
}
```

(`Illuminate\Http\Response` is already imported; `HTTP_LOCKED` = 423.)

- [ ] **Step 4: Run to verify pass** — `./vendor/bin/sail test --filter=TaskApiTest` → all PASS.
- [ ] **Step 5: Pint + commit** — `./vendor/bin/sail php vendor/bin/pint`, then `git add -A && git commit -m "feat: lock kept tasks against edit and delete (423), unlock via kept=false"`.

---

### Task 2: Backend — block deleting a category with open tasks

**Files:**
- Modify: `app/Http/Controllers/Api/V1/CategoryController.php`
- Test: `tests/Feature/Api/V1/CategoryApiTest.php`

**Interfaces:**
- Produces: `DELETE /api/v1/categories/{id}` → 409 when ≥1 active (non-trashed, non-expired) task uses it; 204 otherwise. History tasks never block and keep their category label (already guaranteed by soft deletes + `withTrashed` on `Task::category()`).

- [ ] **Step 1: Write the failing tests** — append to `CategoryApiTest`:

```php
public function test_destroy_category_with_open_tasks_returns_409(): void
{
    $category = Category::factory()->create();
    Task::factory()->for($category)->create(['expires_at' => null]);

    $this->deleteJson("/api/v1/categories/{$category->id}")->assertStatus(409);

    $this->assertNotSoftDeleted('categories', ['id' => $category->id]);
}

public function test_destroy_category_with_only_history_tasks_succeeds(): void
{
    $category = Category::factory()->create();
    $task = Task::factory()->for($category)->create();
    $task->delete();

    $this->deleteJson("/api/v1/categories/{$category->id}")->assertNoContent();
    $this->assertSoftDeleted('categories', ['id' => $category->id]);

    // History still shows the category label after the category is gone.
    $this->getJson('/api/v1/tasks?trashed=only')
        ->assertOk()
        ->assertJsonPath('data.0.category.name', $category->name);
}
```

- [ ] **Step 2: Run to verify failure** — `./vendor/bin/sail test --filter=CategoryApiTest` → first test FAILS (204 instead of 409).

- [ ] **Step 3: Implement the guard** — in `CategoryController` add `use Illuminate\Http\Response;` is already present; replace `destroy`:

```php
public function destroy(Category $category)
{
    if ($category->tasks()->whereNull('deleted_at')->exists()) {
        abort(Response::HTTP_CONFLICT, 'This category is still used by open tasks and cannot be deleted.');
    }

    $category->delete();

    return response()->noContent();
}
```

(`tasks()` is `withTrashed`, so `whereNull('deleted_at')` restores the active-only view; `NotExpiredScope` already excludes expired rows.)

- [ ] **Step 4: Run to verify pass** — `./vendor/bin/sail test --filter=CategoryApiTest` → all PASS.
- [ ] **Step 5: Pint + commit** — `git commit -m "feat: refuse to delete categories still used by open tasks (409)"`.

---

### Task 3: Frontend — clear filter + restore category management nav

**Files:**
- Modify: `resources/js/components/layout/Rail.jsx`
- Modify: `resources/js/features/tasks/TaskList.jsx`
- Test: `resources/js/components/layout/Rail.test.jsx`, `resources/js/features/tasks/TaskList.test.jsx`

**Interfaces:**
- Consumes: `useAppData()` → `{ categories }` (already provided app-wide by `AppDataProvider`).
- Produces: rail links "All tasks" (`/`) and "Manage categories" (`/categories`); a dismissible filter chip on Today linking back to `/`.

- [ ] **Step 1: Write the failing tests.** Append to `Rail.test.jsx`:

```jsx
test('offers All tasks and Manage categories links', () => {
  renderRail();
  expect(screen.getByRole('link', { name: /All tasks/i })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: /Manage categories/i })).toHaveAttribute('href', '/categories');
});
```

Append to `TaskList.test.jsx` (reuse the file's existing api/AppData mocks; add `categories: [{ id: 1, name: 'Work' }]` to the mocked `useAppData` return if not present):

```jsx
test('shows a clear-filter chip when filtered by category', async () => {
  tasks.list.mockResolvedValue({ data: [], meta: { total: 0, current_page: 1, last_page: 1 } });
  render(
    <MemoryRouter initialEntries={['/?category=1']}>
      <TaskList />
    </MemoryRouter>
  );
  const chip = await screen.findByRole('link', { name: /clear work filter/i });
  expect(chip).toHaveAttribute('href', '/');
});
```

- [ ] **Step 2: Run to verify failure** — `./vendor/bin/sail npm run test:run` → new tests FAIL.

- [ ] **Step 3: Implement Rail changes.** In `Rail.jsx`, replace the `<nav>` block with:

```jsx
<nav className="flex flex-col gap-0.5">
  <div className="px-2 pb-2 text-[11px] uppercase tracking-wider text-ink-faint">Categories</div>
  <NavLink
    to="/"
    className="flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-sm hover:bg-surface
      focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
  >
    <span className="h-2.5 w-2.5 rounded-[3px] border border-ink-faint/40" />
    <span className="flex-1">All tasks</span>
    <span className="font-mono text-xs text-ink-soft">{summary.total}</span>
  </NavLink>
  {categories.map((c) => (
    /* existing category NavLink unchanged */
  ))}
  <NavLink
    to="/categories"
    className="mt-1 px-2.5 py-2 text-[12.5px] text-ink-soft hover:text-ink
      focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
  >
    Manage categories →
  </NavLink>
</nav>
```

- [ ] **Step 4: Implement the TaskList chip.** In `TaskList.jsx` add `import { useAppData } from '../../AppData';`, then inside the component:

```jsx
const { categories } = useAppData();
const activeCategory = categoryId
  ? categories.find((c) => String(c.id) === String(categoryId))
  : null;
```

Insert directly below the `<header>` block:

```jsx
{activeCategory && (
  <div className="mb-4">
    <Link
      to="/"
      aria-label={`Clear ${activeCategory.name} filter`}
      className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs text-ink-soft transition hover:text-ink"
    >
      Showing <b className="font-semibold text-ink">{activeCategory.name}</b>
      <span aria-hidden="true" className="text-sm leading-none">×</span>
    </Link>
  </div>
)}
```

- [ ] **Step 5: Run to verify pass** — `./vendor/bin/sail npm run test:run` → all PASS.
- [ ] **Step 6: Verify in browser** (dev stack up, Chrome MCP or manually): filter by a category from the rail → chip appears → clicking it returns to the unfiltered list; "Manage categories →" opens the categories page.
- [ ] **Step 7: Commit** — `git commit -m "feat: clearable category filter and rail link to category management"`.

---

### Task 4: Frontend — locked task treatment (muted row, no edit/delete, Unlock) + category delete UI

**Files:**
- Modify: `resources/js/features/tasks/TaskRow.jsx`
- Modify: `resources/js/features/tasks/TaskDetail.jsx`
- Modify: `resources/js/features/tasks/TaskForm.jsx`
- Modify: `resources/js/features/tasks/TaskList.jsx` (legend icon consistency)
- Modify: `resources/js/features/categories/CategoryDetail.jsx`
- Test: `resources/js/features/tasks/TaskList.test.jsx`, `resources/js/features/tasks/TaskDetail.test.jsx`, `resources/js/features/tasks/TaskForm.test.jsx`

**Interfaces:**
- Consumes: Task 1's 423 lock semantics; unlock = `tasks.update(id, { title, body, category_id, kept: false })`. Task 2's 409 on `categories.remove(id)`.

- [ ] **Step 1: Write the failing tests.** In `TaskList.test.jsx` (TaskRow renders within it; follow the file's existing render helpers):

```jsx
test('locked (kept) rows hide edit and delete and are muted', async () => {
  tasks.list.mockResolvedValue({
    data: [{ id: 9, title: 'Kept one', body: 'b', expires_at: null, category: { id: 1, name: 'Work' } }],
    meta: { total: 1, current_page: 1, last_page: 1 },
  });
  render(<MemoryRouter><TaskList /></MemoryRouter>);
  await screen.findByText('Kept one');
  expect(screen.queryByRole('link', { name: /edit/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
});
```

In `TaskDetail.test.jsx`:

```jsx
test('kept task offers Unlock instead of Edit', async () => {
  tasks.show.mockResolvedValue({ id: 9, title: 'Kept one', body: 'b', expires_at: null, created_at: '2026-07-01T00:00:00Z', category: { id: 1, name: 'Work' } });
  render(<MemoryRouter initialEntries={['/tasks/9']}><Routes><Route path="/tasks/:id" element={<TaskDetail />} /></Routes></MemoryRouter>);
  expect(await screen.findByRole('button', { name: /unlock/i })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /edit task/i })).not.toBeInTheDocument();
});
```

In `TaskForm.test.jsx`:

```jsx
test('editing a kept task shows a locked notice instead of the form', async () => {
  tasks.show.mockResolvedValue({ id: 9, title: 'Kept one', body: 'b', expires_at: null, category: { id: 1, name: 'Work' } });
  render(<MemoryRouter initialEntries={['/tasks/9/edit']}><Routes><Route path="/tasks/:id/edit" element={<TaskForm />} /></Routes></MemoryRouter>);
  expect(await screen.findByText(/locked/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /save task/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure** — `./vendor/bin/sail npm run test:run` → new tests FAIL.

- [ ] **Step 3: TaskRow.** Add `const isKept = !task.expires_at;` and change the Card + actions:

```jsx
<Card className={`group grid grid-cols-[110px_1fr_auto] items-center gap-4 px-4 py-4 transition hover:-translate-y-px ${isKept ? 'bg-[#F2F5F7]' : ''}`}>
```

```jsx
{!isKept && (
  <div className="opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 flex gap-1.5">
    <Link to={`/tasks/${task.id}/edit`}><Button variant="ghost" className="px-3 py-1.5 text-xs">Edit</Button></Link>
    <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={handleDelete}>Delete</Button>
  </div>
)}
```

- [ ] **Step 4: TaskDetail.** Add imports `import { toast } from 'react-toastify';` and an unlock handler:

```jsx
async function handleUnlock() {
  if (!window.confirm('Unlock this task? It becomes editable and starts a fresh 12-hour countdown.')) return;
  try {
    const updated = await tasks.update(task.id, {
      title: task.title,
      body: task.body,
      category_id: task.category?.id,
      kept: false,
    });
    setTask(updated);
    toast.success('Task unlocked');
  } catch {
    toast.error('Could not unlock the task');
  }
}
```

Replace the action row:

```jsx
<div className="mt-5 flex gap-3">
  {task.expires_at ? (
    <Link to={`/tasks/${task.id}/edit`}><Button>Edit task</Button></Link>
  ) : (
    <Button onClick={handleUnlock}>Unlock task</Button>
  )}
  <Link to="/"><Button variant="ghost">Back</Button></Link>
</div>
```

- [ ] **Step 5: TaskForm locked notice.** Add `const [locked, setLocked] = useState(false);`; in the edit-load effect set `if (t.expires_at === null) { setLocked(true); return; }` before `setForm(...)`. Before the main return:

```jsx
if (locked) {
  return (
    <p className="text-ink-soft">
      This task is kept and locked.{' '}
      <Link className="text-ink underline" to={`/tasks/${id}`}>Unlock it from the task page</Link> to edit.
    </p>
  );
}
```

(add `Link` to the react-router-dom import.)

- [ ] **Step 6: Legend consistency.** In `TaskList.jsx`, replace the `🔒` legend span with the same drawn padlock used by `KeptChip`:

```jsx
<span className="inline-flex items-center gap-1.5">
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2F6F7E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4.5" y="11" width="15" height="9.5" rx="2.2" />
    <path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11" />
  </svg>
  kept — stays forever
</span>
```

Same swap for the radio label in `TaskForm.jsx` (replace the `🔒` span with this svg).

- [ ] **Step 7: CategoryDetail delete.** Add imports (`useNavigate`, `toast`, `useAppData`) and:

```jsx
const navigate = useNavigate();
const { reloadCategories } = useAppData();

async function handleDelete() {
  if (!window.confirm('Delete this category?')) return;
  try {
    await categories.remove(cat.id);
    toast.success('Category deleted');
    reloadCategories();
    navigate('/categories');
  } catch (err) {
    if (err?.response?.status === 409) {
      toast.error('This category still has open tasks — move or finish them first.');
    } else {
      toast.error('Could not delete the category');
    }
  }
}
```

Action row becomes:

```jsx
<div className="mt-5 flex gap-3">
  <Link to={`/categories/${cat.id}/edit`}><Button>Edit</Button></Link>
  <Button variant="danger" onClick={handleDelete}>Delete</Button>
  <Link to="/categories"><Button variant="ghost">Back</Button></Link>
</div>
```

- [ ] **Step 8: Run to verify pass** — `./vendor/bin/sail npm run test:run` and `./vendor/bin/sail test` → all PASS.
- [ ] **Step 9: Verify in browser:** kept rows are muted with no hover actions; detail page Unlock works end-to-end (row gains a countdown); `/tasks/{kept}/edit` visited directly shows the locked notice; deleting an in-use category toasts the 409 message; deleting an unused one succeeds and History keeps its labels.
- [ ] **Step 10: Commit** — `git commit -m "feat: immutable locked tasks with unlock action; category delete guard UI"`.

---

## Self-review notes

- All four user asks map to tasks: clear filter (T3), restore category management access (T3), locked-entry immutability + muted row (T1+T4), category deletion guard with history preservation (T2+T4).
- No schema changes needed anywhere — verify nothing in this plan touches migrations.
- 423/409 bodies flow through the existing JSON error envelope; frontend only branches on status codes.
- After finishing: update `docs/FOLLOWUPS.md` if any deferred items arise, and deploy via `docker compose -f docker-compose.prod.yml up -d --build` followed by `docker/reset-demo-data.sh` if seed data changed.
