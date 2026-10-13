#!/bin/sh
# Сброс пароля глобального админа: пишет новый в .env и перезапускает api.
set -e
. "$(dirname "$0")/lib.sh"

NEW="$(openssl rand -hex 12)"
env_set ADMIN_PASSWORD "$NEW"
# на всякий случай лимит файлов тоже в нормальном виде
grep -q '^ROOM_FILES_MAX=' "$ROOT/.env" || env_set ROOM_FILES_MAX 1073741824

recreate "$SERVICE"
echo "Новый пароль админа: $NEW"
echo "Записан в $ROOT/.env, сервис $SERVICE перезапущен."
echo "Откройте /admin и войдите новым паролем."
