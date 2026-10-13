#!/bin/sh
# Бэкап одной комнаты в ./backups/
set -e
. "$(dirname "$0")/lib.sh"

echo "Комнаты:"
api list-rooms
echo
if [ -n "$1" ]; then
  ID="$1"
else
  printf "ID комнаты: "
  read -r ID
fi
[ -n "$ID" ] || { echo "нужен id"; exit 1; }
SHORT="$(printf '%s' "$ID" | cut -c1-8)"
FILE="/backups/room-${SHORT}-$(date +%Y%m%d-%H%M%S).shirmo.json"
api backup-room "$ID" "$FILE"
echo "Файл на хосте: $BACKUP_HOST_DIR/$(basename "$FILE")"
