#!/usr/bin/env bash
set -euo pipefail
# Import a Windows/Node paired backup into a NEW server installation.
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
: "${COMPOSE_ENV_FILE:?Set absolute production env file path}"
: "${COMPOSE_PROJECT_NAME:?Set the intended deployment project name}"
[[ "${RESTORE_EMPTY_TARGET:-}" = yes ]] || { echo 'Set RESTORE_EMPTY_TARGET=yes for a new empty deployment'; exit 1; }
source=${1:?Usage: restore-local.sh /absolute/paired-backup-directory}
[[ "$source" = /* && -f "$source/manifest.json" && -f "$source/database.dump" ]] || { echo 'Expected Node paired backup'; exit 1; }
compose=(docker compose --env-file "$COMPOSE_ENV_FILE" -f "$root/infrastructure/compose.production.yml")
[[ -z "$("${compose[@]}" ps --status running -q app)" ]] || { echo 'Stop target app before import'; exit 1; }
"${compose[@]}" up -d --pull never db
ready=false
for attempt in $(seq 1 60); do
  if "${compose[@]}" exec -T db pg_isready -U scale_lab -d scale_lab >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" = true ]] || { echo 'Database not ready'; exit 1; }
runner=("${compose[@]}" run --rm --no-deps -T --pull never --user 0:0 --cap-add DAC_OVERRIDE -v "$source:/migration:ro" app node backend/scripts/backup-restore.js)
"${runner[@]}" prepare-restore --directory /migration
"${compose[@]}" exec -T db pg_restore -U scale_lab -d scale_lab --exit-on-error --single-transaction --no-owner --no-acl < "$source/database.dump"
"${runner[@]}" restore-media --directory /migration
# Migration media is written by a temporary root container; hand ownership to the app.
"${compose[@]}" run --rm --no-deps -T --pull never --user 0:0 --cap-add CHOWN --cap-add DAC_OVERRIDE --entrypoint chown app -R node:node /app/backend/storage/media
"${runner[@]}" verify --directory /migration
echo 'Import verified. Apply migrations and provision production accounts before starting app/proxy.'
