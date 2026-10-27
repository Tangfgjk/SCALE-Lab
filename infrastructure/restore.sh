#!/usr/bin/env bash
set -euo pipefail
# Restore ONLY into a newly created, empty Compose project, never an existing live one.
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
: "${COMPOSE_ENV_FILE:?Set absolute target env file path}"
: "${COMPOSE_PROJECT_NAME:?Set a NEW, separate Compose project name}"
[[ "${RESTORE_EMPTY_TARGET:-}" = yes ]] || { echo 'Set RESTORE_EMPTY_TARGET=yes after preparing an empty target'; exit 1; }
source=${1:?Usage: restore.sh /absolute/completed/backup-directory}
[[ "$source" = /* && -f "$source/COMPLETE" ]] || { echo 'Not a completed backup'; exit 1; }
(cd "$source" && sha256sum -c SHA256SUMS)
if tar -tf "$source/media.tar" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then echo 'Unsafe archive path'; exit 1; fi
compose=(docker compose --env-file "$COMPOSE_ENV_FILE" -f "$root/infrastructure/compose.production.yml")
"${compose[@]}" up -d db
for attempt in $(seq 1 60); do
  if "${compose[@]}" exec -T db pg_isready -U scale_lab -d scale_lab >/dev/null 2>&1; then break; fi
  sleep 1
done
tables=$("${compose[@]}" exec -T db psql -U scale_lab -d scale_lab -Atc "SELECT count(*) FROM pg_tables WHERE schemaname='public'")
[[ "$tables" = 0 ]] || { echo 'Target database is not empty; refusing restore'; exit 1; }
"${compose[@]}" run --rm --no-deps -T --entrypoint node app -e "if(require('fs').readdirSync('/app/backend/storage/media').length)process.exit(1)"
"${compose[@]}" exec -T db pg_restore -U scale_lab -d scale_lab --exit-on-error --single-transaction --no-owner --no-acl < "$source/database.dump"
"${compose[@]}" run --rm --no-deps -T --entrypoint tar app -C /app/backend/storage/media -xf - < "$source/media.tar"
echo 'Restore completed. Verify data, apply forward migrations, and fix any local demonstration passwords before starting app/proxy.'
