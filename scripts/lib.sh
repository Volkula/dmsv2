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

# docker-compose 1.29 падает с KeyError ContainerConfig на recreate —
# сначала сносим контейнеры проекта, потом поднимаем.
recreate() {
  $COMPOSE stop "$@" 2>/dev/null || true
  $COMPOSE rm -f "$@" 2>/dev/null || true
  ids="$(docker ps -aq --filter name=dms2_ 2>/dev/null || true)"
  if [ -n "$ids" ]; then
    # shellcheck disable=SC2086
    docker rm -f $ids 2>/dev/null || true
  fi
  $COMPOSE up -d "$@"
}

# Аккуратно пишет/обновляет ключ в .env (всегда с \n в конце файла).
env_set() {
  key="$1"
  value="$2"
  file="${3:-$ROOT/.env}"
  tmp="$file.tmp.$$"
  if [ -f "$file" ]; then
    grep -v "^${key}=" "$file" | tr -d '\r' | sed '/^$/d' > "$tmp" || true
  else
    : > "$tmp"
  fi
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  # гарантируем перевод строки в конце
  [ -s "$tmp" ] && [ "$(tail -c1 "$tmp" | wc -l)" -eq 0 ] && printf '\n' >> "$tmp"
  mv "$tmp" "$file"
}
