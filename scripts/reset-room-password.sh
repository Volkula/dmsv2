#!/bin/sh
# Сброс пароля комнаты. Без аргумента — список и запрос id.
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
api reset-room-password "$ID"
