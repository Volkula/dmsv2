# Выкладка

## Локально

```bash
cd /path/to/screen
docker-compose up -d --build
```

Проверка: `curl http://127.0.0.1:8088/api/health` → `{"ok":true}`.

Веб смонтирован как `./web:/srv/web:ro`. После правок фронта достаточно обновить страницу (иногда с учётом `?v=` в `index.html`).

## Сервер vpn.volkula.com

Каталог: `/opt/dms2`. Ветка: `screen`.

| Порт | Протокол |
|------|----------|
| **8088** | HTTP |
| **8443** | HTTPS — Let's Encrypt `/etc/letsencrypt/live/vpn.volkula.com/` |

Порт 443 на хосте занят gost, поэтому HTTPS ширмы — на **8443**.

```bash
ssh root@vpn.volkula.com
cd /opt/dms2
git pull --ff-only origin screen
# PORT в docker-compose.yml должен быть 8080 (Caddy проксирует на api:8080)
grep PORT docker-compose.yml
docker-compose down
docker rm -f $(docker ps -aq --filter name=dms2) 2>/dev/null || true
docker-compose up -d --build
curl -s https://127.0.0.1:8443/api/health
```

Открыть: [https://vpn.volkula.com:8443/](https://vpn.volkula.com:8443/) или [http://vpn.volkula.com:8088/](http://vpn.volkula.com:8088/).

### Типичные поломки

1. **API не отвечает, статика открывается**  
   В `docker-compose.yml` ошибочно поставили `PORT: "8088"`. Caddy всё равно бьёт в `api:8080`. Верните `8080`, пересоздайте контейнеры.

2. **`docker compose` не найден / `ContainerConfig`**  
   На хосте стоит compose 1.29. Используйте `docker-compose`. При ошибке recreate: `down`, удалить контейнеры `dms2_*`, снова `up -d --build`.

3. **Порт 8088 занят**  
   Смотрите `docker ps` и `ss -lntp`. Gost-UI занимает 8080 снаружи — это нормально, ширма слушает 8088.

### Данные

Volume Docker `dms2_shirmo-data` (или `shirmo-data` в имени проекта). Бэкап: скопировать volume или файл `shirmo.sqlite` из `/data` контейнера.

```bash
docker exec dms2_api_1 ls -la /data
```

Ключи мастера лежат в SQLite. Корзина — поле `deleted_at`, файлы комнаты при soft-delete не трогаются.
