#!/bin/sh
# Удаляет все комнаты из корзины вместе с файлами.
set -e
. "$(dirname "$0")/lib.sh"
api purge-trash
