#!/bin/sh
# Общие настройки для скриптов рядом с docker-compose.yml
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
COMPOSE="${COMPOSE:-docker-compose}"
SERVICE="${SERVICE:-api}"
BACKUP_HOST_DIR="${BACKUP_HOST_DIR:-$ROOT/backups}"
mkdir -p "$BACKUP_HOST_DIR"

api() {
  $COMPOSE exec -T "$SERVICE" node src/cli.js "$@"
}
