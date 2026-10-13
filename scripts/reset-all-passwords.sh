#!/bin/sh
# Сброс паролей всех комнат. Печатает id, название, новый пароль.
set -e
. "$(dirname "$0")/lib.sh"
echo "Будут сброшены пароли ВСЕХ комнат. Продолжить? [y/N]"
read -r OK
case "$OK" in
  y|Y|yes|YES) ;;
  *) echo "отменено"; exit 1 ;;
esac
api reset-all-passwords
