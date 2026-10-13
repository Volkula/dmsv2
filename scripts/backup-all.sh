#!/bin/sh
# Полный бэкап всех комнат + sqlite в ./backups/full-...
set -e
. "$(dirname "$0")/lib.sh"
DIR="$BACKUP_HOST_DIR/full-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DIR"
# Пишем внутрь контейнера в /backups (смонтирован на ./backups)
NAME="$(basename "$DIR")"
api backup-all "/backups/$NAME"
echo "Готово: $DIR"
