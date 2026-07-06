#!/usr/bin/env bash
# Resets the Daybook demo database to the seeded state.
# Run daily via cron; safe to run manually at any time.
set -euo pipefail

CONTAINER=daybook-app-1

echo "[$(date -Is)] resetting demo data..."
docker exec "$CONTAINER" php artisan migrate:fresh --seed --force
echo "[$(date -Is)] done."
