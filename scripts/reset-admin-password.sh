#!/bin/sh
# Сброс пароля глобального админа: пишет новый в .env и перезапускает api.
set -e
. "$(dirname "$0")/lib.sh"

ENV_FILE="$ROOT/.env"
NEW="$(openssl rand -hex 12)"

if [ -f "$ENV_FILE" ]; then
  if grep -q '^ADMIN_PASSWORD=' "$ENV_FILE"; then
    sed -i.bak "s/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=$NEW/" "$ENV_FILE"
  else
    printf '\nADMIN_PASSWORD=%s\n' "$NEW" >> "$ENV_FILE"
  fi
else
  printf 'ADMIN_PASSWORD=%s\n' "$NEW" > "$ENV_FILE"
fi

$COMPOSE up -d "$SERVICE"
echo "Новый пароль админа: $NEW"
echo "Записан в $ENV_FILE и сервису $SERVICE перезапущен."
echo "Откройте /admin и войдите новым паролем."
