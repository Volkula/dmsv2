#!/bin/sh
# Восстановление комнаты из .shirmo.json (путь на хосте в ./backups или абсолютный).
set -e
. "$(dirname "$0")/lib.sh"

FILE="${1:-}"
PASS="${2:-}"
if [ -z "$FILE" ]; then
  printf "Путь к .shirmo.json: "
  read -r FILE
fi
[ -n "$FILE" ] || { echo "нужен файл"; exit 1; }

# Если путь относительный — от backups/
case "$FILE" in
  /*) HOST="$FILE" ;;
  *) HOST="$BACKUP_HOST_DIR/$FILE" ;;
esac
[ -f "$HOST" ] || { echo "нет файла: $HOST"; exit 1; }

BASE="$(basename "$HOST")"
# Копируем в смонтированный backups, если ещё не там
if [ "$(CDPATH= cd -- "$(dirname "$HOST")" && pwd)" != "$(CDPATH= cd -- "$BACKUP_HOST_DIR" && pwd)" ]; then
  cp -a "$HOST" "$BACKUP_HOST_DIR/$BASE"
fi

if [ -n "$PASS" ]; then
  api restore-room "/backups/$BASE" "$PASS"
else
  api restore-room "/backups/$BASE"
fi
