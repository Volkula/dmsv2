# Архитектура

## Два документа и короткие события

| Сущность | Смысл |
|----------|--------|
| **Campaign** | Черновик мастера: страницы, карта, бой, справочник, библиотека |
| **Frame** | То, что видит игрок сейчас (проекция кампании) |
| **Events** | Броски, пинги, товары — секунды, в кадр не кладутся |

Аккаунтов нет. Мастер ходит с Bearer-ключом. Игрок читает `frame` и SSE `events`.

## Комната в SQLite

Таблица `rooms`:

- `id`, `title`
- `master_salt` / `master_hash` — проверка ключа
- `master_key` — сам ключ (чтобы список комнат снова открывал «Мастер»)
- `publish_mode` — `live` | `hold`
- `campaign`, `frame` — JSON
- `roll_log`, `roll_pins`
- `updated_at`, `deleted_at` — `deleted_at > 0` значит комната в корзине

Файлы: `/data/files/{roomId}/{fileId}`.

## Основные маршруты

| Метод | Путь | Кто |
|-------|------|-----|
| GET | `/api/health` | все |
| GET | `/api/rooms` | все — `rooms` и `trash` (с ключами) |
| POST | `/api/rooms` | все — создать, вернуть `masterKey` |
| DELETE | `/api/rooms/:id` | все — в корзину |
| POST | `/api/rooms/:id/restore` | все — из корзины |
| GET | `/api/rooms/:id/frame` | все |
| GET | `/api/rooms/:id/events` | все (SSE) |
| GET/PUT | `/api/rooms/:id/campaign` | мастер |
| POST | `/api/rooms/:id/show` | мастер — пересчитать кадр |
| POST | `/api/rooms/:id/files` | мастер |
| POST | `/api/rooms/:id/events` | мастер — dice / ping / goods |

## Бой

`campaign.battle`: актёры, `board` (отряды и разделители), лог, фон, раунд, ход.

На экране игроков:

- трек инициативы с портретами/значками и статусами под ними
- полосы боссов только у тех, у кого `boss === true` (снятая галочка даёт `boss: false` и полосу убирает)
- цвет рамки из `actor.color` (у врагов по умолчанию разные)
- раунд по центру

Мастер бьёт из строки «Атака» или общей кнопки «Атаковать».

## Фронт

Статика в `web/`. Кэш скриптов через `?v=` в `index.html`. Правки JS/CSS на bind-mount не требуют rebuild образа API; правки `api/src` — нужен rebuild контейнера `api`.
