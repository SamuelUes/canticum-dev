#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DB_HOST:-}" || -z "${DB_NAME:-}" || -z "${DB_USER:-}" || -z "${DB_PASSWORD:-}" ]]; then
  echo "Missing required DB env vars (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD)."
  exit 1
fi

export PGPASSWORD="$DB_PASSWORD"
DB_PORT="${DB_PORT:-5432}"
SSLMODE="${DB_SSLMODE:-require}"

run_sql() {
  local file="$1"
  echo "Running ${file}..."
  psql "host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER sslmode=$SSLMODE" -v ON_ERROR_STOP=1 -f "$file"
}

run_sql /app/bruin/sql/00_phase2_schema.sql
run_sql /app/bruin/sql/10_refresh_song_artist_metrics.sql
run_sql /app/bruin/sql/20_refresh_featured_snapshots.sql

echo "Phase 2 refresh completed."
