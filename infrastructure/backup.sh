#!/usr/bin/env bash
set -euo pipefail
umask 077
# Run on the Linux deployment host. Give a NEW directory outside the public website.
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
: "${COMPOSE_ENV_FILE:?Set the absolute production env file path}"
destination=${1:?Usage: backup.sh /absolute/new/backup-directory}
[[ "$destination" = /* && ! -e "$destination" ]] || { echo 'Choose a new absolute backup directory'; exit 1; }
compose=(docker compose --env-file "$COMPOSE_ENV_FILE" -f "$root/infrastructure/compose.production.yml")
mkdir -m 700 -p -- "$destination"
"${compose[@]}" stop app
trap '"${compose[@]}" start app >/dev/null' EXIT
"${compose[@]}" exec -T db pg_dump -U scale_lab -d scale_lab -Fc --no-owner --no-acl > "$destination/database.dump"
"${compose[@]}" run --rm --no-deps -T --entrypoint tar app -C /app/backend/storage/media -cf - . > "$destination/media.tar"
git -C "$root" rev-parse HEAD > "$destination/app-commit.txt"
(cd "$destination" && sha256sum database.dump media.tar app-commit.txt > SHA256SUMS)
date -u +%FT%TZ > "$destination/COMPLETE"
echo "Completed paired backup: $destination"
