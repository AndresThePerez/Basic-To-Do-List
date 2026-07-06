# Follow-ups & known notes

A running list of items flagged during the modernization that were intentionally
deferred (not bugs blocking the PR). Grouped by area. Nothing here is required for
the app to work; each is a small improvement or an ops note to keep in mind.

## Ops / deployment

- **First production deploy needs a migrate.** `docker-compose.prod.yml` persists the
  SQLite file in the `sqlite-data` named volume mounted at `/var/www/html/database`,
  which shadows the file baked into the image. Run `php artisan migrate --force`
  (and optionally `--seed`) on the first deploy to initialize the DB in the volume.
- **Local rootless-Podman / SELinux override is intentionally uncommitted.** Running
  Sail on this Fedora workstation uses a local, git-ignored `docker-compose.override.yml`
  (`SUPERVISOR_PHP_USER=root`) plus `APP_USER=root` and the `APP_PORT=8081`/`VITE_PORT=5174`
  overrides in `.env`. These are temporary/local; the canonical values (ports 80/5173,
  default user) live in `.env.example` and the committed `docker-compose.yml`. Revert by
  deleting the override file and the extra `.env` lines.

## Backend (small, non-blocking — from the final review)

- **Uniqueness validation sees hidden rows.** `Rule::unique('tasks','title')` and
  `unique('categories','name')` check against soft-deleted *and* TTL-expired rows that the
  UI hides. A user can get "title already taken" for a title that looks unused. Consider
  scoping the rule (`->whereNull('deleted_at')` and/or excluding expired) or documenting it.
  Hourly prune mitigates the expired case.
- **`exists:categories,id` ignores soft-deletes** — a task can be attached to a
  soft-deleted category. Edge case.
- **`TaskResource` uses `whenLoaded('category')` while `Task::$with = ['category']`** always
  eager-loads it, so the conditional never short-circuits. Harmless, but if `$with` is ever
  removed the category would silently vanish from responses.
- **No rate-limit/throttle test.** `throttle:api` (60/min) and `throttle:api-write` (15/min)
  are wired but not covered by a test. (`TestCase::setUp()` flushes the cache so throttle
  counters don't bleed across tests — adding a throttle test would need enough requests
  within one test to trip the limit.)
- **`CategoryController@index` has no filters** (`?category_id`/`?trashed=only`) the way
  `TaskController@index` does — an intentional asymmetry, not required by the spec.
- **Test hygiene nits:** `test_missing_resource_uses_json_envelope` hardcodes `/api/v1/tasks/999`
  (safe under `RefreshDatabase`); the 422-envelope test asserts the shape but not the absence
  of unexpected error keys. Controller action methods lack explicit return-type hints (stylistic).
- **Migration files carry an executable bit** — a pre-existing repo-wide quirk; the two new
  migrations are correct (`100644`). A repo-wide `chmod -x` on `database/migrations/*.php`
  would tidy it.

## Frontend (already addressed — recorded for context)

These were flagged during the walkthrough and **fixed** in CP4 polish; listed so the history
is clear:

- Category-list rows now show a colored dot + bold name (were chip-only).
- Rail category counts + "open today" total now refresh live after create/delete
  (`reloadCategories()` from `AppData`), not just on full reload.
- Today list shows a small legend (time-left vs. kept).
- Accessibility contrast tokens darkened (`ink-soft`, `ink-faint`, `ember-low`) →
  Lighthouse Accessibility/Best-Practices/SEO all 100; added meta description + favicon.

## Possible next features (ideas, not committed to)

- A "restore from history" action (the API currently has no un-delete endpoint; History is
  read-only).
- A real ephemeral/kept split in the rail summary (currently shows a single total).
- A summary/counts endpoint so the rail doesn't derive totals from the categories list.

## Dev environment on the home server (added 2026-07-05)

The Sail dev stack was set up and verified on this host (rootless Docker)
and then brought down after deploying to prod. To resume frontend/backend work with live
reload:

1. **Rootless-Docker override (git-ignored, should still exist):**
   `docker-compose.override.yml` at the repo root with:
   ```yaml
   services:
       laravel.test:
           environment:
               SUPERVISOR_PHP_USER: root
   ```
   Without it every request 500s (`storage/logs/laravel.log: Permission denied`) because
   rootless Docker maps the `sail` user to an unprivileged host UID. Same class of issue
   already documented above for the Fedora workstation.

2. **Bring the stack up:**
   ```bash
   cd ~/apps/Daybook
   export WWWUSER=$(id -u) WWWGROUP=$(id -g)
   ./vendor/bin/sail up -d          # app on :8080 (prod stays on :8081)
   ./vendor/bin/sail exec -d laravel.test npm run dev -- --host 0.0.0.0
   ```

3. **If testing from another machine on the LAN** (e.g. Chrome on the workstation),
   the Vite dev server needs two temporary tweaks that should NOT be committed:
   - `vite.config.js`: add `server: { host: "0.0.0.0", cors: true, allowedHosts: ["<lan-hostname>"] }`
     (Vite blocks non-localhost Host headers, and :8080→:5173 is cross-origin).
   - `public/hot`: overwrite with `http://<lan-hostname>:5173` (Vite writes `http://0.0.0.0:5173`,
     which browsers cannot dial). Re-overwrite after every Vite restart — Vite rewrites the file.
   Revert the `vite.config.js` change before committing/deploying; `public/hot` is git-ignored
   and disappears when Vite stops.

4. **`@viteReactRefresh` in `welcome.blade.php` is required** — it was missing and broke
   React Fast Refresh under the dev server ("can't detect preamble"). The fix is in the
   working tree; don't remove the directive. Production builds never exercise it, which is
   why it went unnoticed.

5. **Deploying to prod:** `docker compose -f docker-compose.prod.yml up -d --build`
   (bakes the working tree into the image), then `bash docker/reset-demo-data.sh` if the
   seeders changed. Prod SQLite lives in the `sqlite-data` named volume, fully separate
   from the dev bind-mounted `database/database.sqlite`.

Next planned work: `docs/superpowers/plans/2026-07-05-category-management-and-locked-tasks.md`.

## Prod volume shadows `database/` code (found during 2026-07-05 deploy)

`docker-compose.prod.yml` mounts the `sqlite-data` named volume at
`/var/www/html/database` — that shadows the **whole directory**, not just the
SQLite file. The volume was initialized from the image on first deploy (Jul 3),
so `migrations/` and `seeders/` inside the container are frozen at that date:
rebuilding the image does NOT update them, and `reset-demo-data.sh` keeps
running the old seeder. Symptom seen: after deploying the kept-task seeder,
all demo tasks still seeded with `expires_at = null` (everything looked kept).

Workaround applied: `docker compose -f docker-compose.prod.yml cp database/seeders/. app:/var/www/html/database/seeders/`
then rerun `docker/reset-demo-data.sh`. Repeat the `cp` after any seeder/migration
change until the proper fix lands.

Proper fix (deferred): scope the volume to the data file only, e.g. mount
`sqlite-data:/var/www/html/database/data` and point `DB_DATABASE` at
`database/data/database.sqlite` (needs a one-time data migration), so code in
`database/` always comes from the image.

Related fix already applied: `public/hot` and `public/build` are now in
`.dockerignore` — a leftover dev-server `hot` file was previously baked into
the image, making prod serve Vite dev-server asset URLs (blank page,
`ERR_CONNECTION_REFUSED`). That was the cause of the blank page at :8081.

Note: direct LAN access via `http://<lan-hostname>:8081` renders asset URLs
without the port (nginx reports port 80 to PHP) and will look blank — always
test prod through `https://daybook.andrestheperez.com`.
