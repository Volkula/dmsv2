import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { openDb, rowToRoom } from "./db.js";
import { bearer, hashSecret, isAdmin, newSecret, secretMatches } from "./auth.js";
import { publish, subscribe } from "./hub.js";
import { blankCampaign, campaignOk, playAction, projectFrame } from "./frame.js";
import { openSettings } from "./settings.js";
import { handlePlugin } from "./plugins.js";
import { ROOM_FILES_MAX, roomFilesSize, unpackFiles, wipeRoomFiles, writePackedFiles, pipePackedFiles } from "./files.js";
import { absorbPortraits } from "./portraits.js";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const port = Number(process.env.PORT || 8080);
const db = openDb(dataDir);
const filesDir = path.join(dataDir, "files");
const settings = openSettings(dataDir);
const backupRoot = process.env.BACKUP_DIR || "/backups";

const selectRoom = db.prepare("SELECT * FROM rooms WHERE id = ?");
const listRooms = db.prepare("SELECT id, title, master_key, updated_at, deleted_at FROM rooms ORDER BY updated_at DESC");
const insertRoom = db.prepare(`
  INSERT INTO rooms (id, title, master_salt, master_hash, master_key, publish_mode, campaign, frame, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const saveRoom = db.prepare(`
  UPDATE rooms
  SET title = ?, publish_mode = ?, campaign = ?, frame = ?, updated_at = ?
  WHERE id = ?
`);
const saveKey = db.prepare("UPDATE rooms SET master_key = ? WHERE id = ?");
const saveAuth = db.prepare("UPDATE rooms SET master_salt = ?, master_hash = ?, master_key = ?, updated_at = ? WHERE id = ?");
const trashRoom = db.prepare("UPDATE rooms SET deleted_at = ? WHERE id = ?");
const restoreRoom = db.prepare("UPDATE rooms SET deleted_at = 0 WHERE id = ?");
const purgeRoom = db.prepare("DELETE FROM rooms WHERE id = ?");
const saveRolls = db.prepare("UPDATE rooms SET roll_log = ? WHERE id = ?");
const savePins = db.prepare("UPDATE rooms SET roll_pins = ? WHERE id = ?");

const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100];
const FILE_UPLOAD_MAX = Math.min(ROOM_FILES_MAX, 50_000_000);

function hexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "")) ? String(value) : "";
}

function safePath(value) {
  const text = String(value || "");
  if (!text.startsWith("/") || text.length > 240 || text.indexOf("..") >= 0) return "";
  return text;
}

function publicRoll(roll) {
  const dice = Array.isArray(roll.dice) ? roll.dice.slice(0, 12).map(function (item) {
    const sides = DIE_SIDES.indexOf(Number(item && item.sides)) >= 0 ? Number(item.sides) : 20;
    const value = Math.min(sides, Math.max(1, Number(item && item.value) || 1));
    const tint = item && (item.tint === "advantage" || item.tint === "disadvantage") ? item.tint : "";
    const out = { sides: sides, value: value };
    if (tint) out.tint = tint;
    return out;
  }) : [];
  const speed = Number(roll.speed);
  return {
    name: String(roll.name || "").slice(0, 80),
    label: String(roll.label || "").slice(0, 40),
    total: Number(roll.total) || 0,
    count: Number(roll.count) || 1,
    sides: Number(roll.sides) || 20,
    mode: roll.mode === "advantage" || roll.mode === "disadvantage" ? roll.mode : "normal",
    log: String(roll.log || "").slice(0, 120),
    verdict: roll.verdict === "Пробил" || roll.verdict === "Не пробил" || roll.verdict === "Крит" ? roll.verdict : "",
    dice: dice,
    color: hexColor(roll.color),
    texture: safePath(roll.texture),
    speed: Number.isFinite(speed) ? Math.min(2.5, Math.max(0.4, speed)) : 1,
    animate: roll.animate !== false
  };
}

function modOf(value) {
  const mod = Math.round(Number(value));
  if (!Number.isFinite(mod)) return 0;
  return Math.min(99, Math.max(-99, mod));
}

function pinFrom(body) {
  const mode = body.mode === "advantage" || body.mode === "disadvantage" ? body.mode : "normal";
  const sides = DIE_SIDES.indexOf(Number(body.sides)) >= 0 ? Number(body.sides) : 20;
  const count = mode === "normal" ? Math.min(12, Math.max(1, Number(body.count) || 1)) : 2;
  const source = body.source === "codex" || body.source === "npc" ? body.source : "sheet";
  const fallback = (mode === "advantage" ? "Преимущество" : mode === "disadvantage" ? "Помеха" : count + "d" + sides);
  return {
    id: randomUUID(),
    name: String(body.name || fallback).slice(0, 80),
    count: count,
    sides: mode === "normal" ? sides : 20,
    mode: mode,
    source: source,
    sourceName: String(body.sourceName || "").slice(0, 80),
    color: hexColor(body.color),
    texture: safePath(body.texture),
    mod: modOf(body.mod)
  };
}

function send(res, status, body, headers) {
  const payload = body == null ? "" : JSON.stringify(body);
  res.writeHead(status, Object.assign({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }, headers));
  res.end(payload);
}

function readJson(req, maxBytes) {
  const limit = maxBytes || 2_000_000;
  return new Promise(function (resolve, reject) {
    const chunks = [];
    let size = 0;
    req.on("data", function (chunk) {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("too big"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", function () {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(Object.assign(new Error("bad json"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function passOk(value) {
  const text = String(value || "");
  return text.length >= 4 && text.length <= 120 ? text : "";
}

function retarget(value, fromId, toId) {
  if (!fromId || fromId === toId) return value;
  return JSON.parse(JSON.stringify(value).split("/api/rooms/" + fromId + "/").join("/api/rooms/" + toId + "/"));
}

function roomById(id) {
  return rowToRoom(selectRoom.get(id));
}

const liveState = new Map();

function liveBag(id) {
  let bag = liveState.get(id);
  if (!bag) {
    bag = { timer: null };
    liveState.set(id, bag);
  }
  return bag;
}

function timerReplay(saved) {
  if (!saved || saved.on !== true) return null;
  const event = Object.assign({}, saved);
  if (event.running && event.until) {
    const left = event.until - Date.now();
    if (left > 0) event.remain = Math.round(left);
    else {
      event.running = false;
      event.remain = 0;
      event.until = 0;
      event.done = true;
    }
  }
  return event;
}

function isMaster(req, room) {
  const secret = bearer(req);
  const ok = secretMatches(secret, room.masterSalt, room.masterHash);
  if (ok && !room.masterKey && secret) {
    room.masterKey = secret;
    saveKey.run(secret, room.id);
  }
  return ok;
}

function keepPluginSwitch(room) {
  const fresh = rowToRoom(selectRoom.get(room.id));
  const prevPlugins = fresh && fresh.campaign && fresh.campaign.plugins;
  const nextPlugins = room.campaign && room.campaign.plugins;
  if (!nextPlugins || typeof nextPlugins !== "object" || Array.isArray(nextPlugins)) return;
  const prev = prevPlugins && prevPlugins.installed;
  const next = nextPlugins.installed;
  if (Array.isArray(next) && Array.isArray(prev)) {
    next.forEach(function (row) {
      if (!row || !row.id) return;
      const was = prev.find(function (item) { return item && item.id === row.id; });
      row.on = was ? was.on === true : false;
    });
  }
  const prevLight = prevPlugins && prevPlugins.light && typeof prevPlugins.light === "object" && !Array.isArray(prevPlugins.light) ? prevPlugins.light : null;
  if (!nextPlugins.light || typeof nextPlugins.light !== "object" || Array.isArray(nextPlugins.light)) nextPlugins.light = {};
  if (prevLight && Array.isArray(prevLight.devices)) nextPlugins.light.devices = prevLight.devices.slice();
  if (prevLight && typeof prevLight.auto === "boolean") nextPlugins.light.auto = prevLight.auto;
}

function writeRoom(room) {
  const now = Date.now();
  room.updatedAt = now;
  saveRoom.run(
    room.title,
    room.publishMode,
    JSON.stringify(room.campaign),
    JSON.stringify(room.frame),
    now,
    room.id
  );
}

function pushFrame(room) {
  publish(room.id, { type: "frame", frame: room.frame });
}

function setRoomPassword(roomId, password) {
  const hashed = hashSecret(password);
  saveAuth.run(hashed.salt, hashed.hash, password, Date.now(), roomId);
}

function createRoom(title, key) {
  const id = randomUUID();
  const hashed = hashSecret(key);
  const pageId = randomUUID();
  const campaign = blankCampaign(pageId);
  const frame = projectFrame(campaign);
  const now = Date.now();
  insertRoom.run(id, title, hashed.salt, hashed.hash, key, "live", JSON.stringify(campaign), JSON.stringify(frame), now);
  return { id: id, title: title, masterKey: key };
}

function stamp() {
  const d = new Date();
  const p = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

function backupFileName(title, id) {
  const base = String(title || "room").replace(/[^\w.\-а-яА-ЯёЁ ]+/gi, "_").trim() || "room";
  return base.slice(0, 80) + "-" + String(id || "").slice(0, 8) + ".shirmo.json";
}

/** Пишет выгрузку на диск по частям — иначе base64 всех файлов комнаты убивает Node на ~1 ГБ RAM. */
function writeRoomBackupFile(id, filePath) {
  const room = roomById(id);
  if (!room) return null;
  const row = selectRoom.get(id);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const fd = fs.openSync(filePath, "w");
  try {
    fs.writeSync(fd, '{"roomId":' + JSON.stringify(id));
    fs.writeSync(fd, ',"title":' + JSON.stringify(room.title));
    fs.writeSync(fd, ',"campaign":' + JSON.stringify(room.campaign));
    fs.writeSync(fd, ',"rolls":' + JSON.stringify(room.rolls));
    fs.writeSync(fd, ',"pins":' + JSON.stringify(room.pins));
    fs.writeSync(fd, ',"files":');
    writePackedFiles(fd, filesDir, id);
    fs.writeSync(fd, ',"deletedAt":' + Number(row && row.deleted_at || 0) + "}");
  } finally {
    fs.closeSync(fd);
  }
  return filePath;
}

function writeHttpChunk(res, chunk) {
  return new Promise(function (resolve, reject) {
    if (res.writableEnded || res.destroyed) {
      reject(new Error("closed"));
      return;
    }
    if (res.write(chunk)) {
      resolve();
      return;
    }
    res.once("drain", resolve);
    res.once("error", reject);
  });
}

/** Стримит выгрузку сразу в ответ — иначе минуты тишины, пока файл собирается на диске. */
async function sendBackupDownload(res, id) {
  const room = roomById(id);
  if (!room) {
    send(res, 404, { error: "not found" });
    return;
  }
  const row = selectRoom.get(id);
  const name = backupFileName(room.title, id);
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-disposition": 'attachment; filename="' + name.replace(/"/g, "") + '"',
    "cache-control": "no-store"
  });
  const write = function (chunk) { return writeHttpChunk(res, chunk); };
  try {
    await write('{"roomId":' + JSON.stringify(id));
    await write(',"title":' + JSON.stringify(room.title));
    await write(',"campaign":' + JSON.stringify(room.campaign));
    await write(',"rolls":' + JSON.stringify(room.rolls));
    await write(',"pins":' + JSON.stringify(room.pins));
    await write(',"files":');
    await pipePackedFiles(write, filesDir, id);
    await write(',"deletedAt":' + Number(row && row.deleted_at || 0) + "}");
    res.end();
  } catch (err) {
    if (!res.writableEnded) res.destroy();
  }
}

function writeFullBackup(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const index = [];
  listRooms.all().forEach(function (row) {
    const name = row.id + ".shirmo.json";
    writeRoomBackupFile(row.id, path.join(dir, name));
    index.push({ id: row.id, title: row.title, file: name, deletedAt: row.deleted_at || 0 });
  });
  fs.copyFileSync(path.join(dataDir, "shirmo.sqlite"), path.join(dir, "shirmo.sqlite"));
  try { fs.copyFileSync(settings.file, path.join(dir, "settings.json")); } catch (err) { /* нет */ }
  fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify({ at: Date.now(), rooms: index }, null, 2));
  return { dir: dir, rooms: index.length };
}

const server = http.createServer(async function (req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);

    if (req.method === "GET" && url.pathname === "/api/health") {
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/meta") {
      const conf = settings.read();
      send(res, 200, {
        publicCreate: conf.publicCreate !== false,
        roomFilesMax: ROOM_FILES_MAX,
        admin: Boolean(process.env.ADMIN_PASSWORD)
      });
      return;
    }

    if (parts[0] === "api" && parts[1] === "admin") {
      if (req.method === "POST" && parts[2] === "login") {
        const body = await readJson(req);
        if (!process.env.ADMIN_PASSWORD) {
          send(res, 503, { error: "ADMIN_PASSWORD не задан" });
          return;
        }
        if (!isAdmin({ headers: { authorization: "Bearer " + String(body.password || "") } })) {
          send(res, 401, { error: "неверный пароль админа" });
          return;
        }
        send(res, 200, { ok: true, token: String(body.password || "") });
        return;
      }

      if (!isAdmin(req)) {
        send(res, 401, { error: "unauthorized" });
        return;
      }

      if (req.method === "GET" && !parts[2]) {
        const conf = settings.read();
        const rooms = listRooms.all().map(function (row) {
          return {
            id: row.id,
            title: row.title,
            updatedAt: row.updated_at,
            deletedAt: row.deleted_at || 0,
            filesBytes: roomFilesSize(filesDir, row.id)
          };
        });
        send(res, 200, {
          publicCreate: conf.publicCreate !== false,
          roomFilesMax: ROOM_FILES_MAX,
          rooms: rooms
        });
        return;
      }

      if (req.method === "PUT" && parts[2] === "config") {
        const body = await readJson(req);
        const on = body.publicCreate === true || body.publicCreate === "on" || body.publicCreate === 1 || body.publicCreate === "1";
        const off = body.publicCreate === false || body.publicCreate === "off" || body.publicCreate === 0 || body.publicCreate === "0";
        if (!on && !off) {
          send(res, 400, { error: "publicCreate: true|false" });
          return;
        }
        send(res, 200, settings.write({ publicCreate: on }));
        return;
      }

      if (req.method === "POST" && parts[2] === "rooms" && !parts[3]) {
        const body = await readJson(req);
        const title = String(body.title || "Комната").slice(0, 80);
        const key = passOk(body.password) || newSecret().slice(0, 16);
        const room = createRoom(title, key);
        send(res, 201, room);
        return;
      }

      if (req.method === "POST" && parts[2] === "rooms" && parts[3] && parts[4] === "password") {
        const id = parts[3];
        if (!selectRoom.get(id)) {
          send(res, 404, { error: "not found" });
          return;
        }
        const body = await readJson(req);
        const key = passOk(body.password) || newSecret().slice(0, 16);
        setRoomPassword(id, key);
        send(res, 200, { id: id, masterKey: key });
        return;
      }

      if (req.method === "POST" && parts[2] === "passwords" && parts[3] === "reset-all") {
        const out = listRooms.all().map(function (row) {
          const key = newSecret().slice(0, 16);
          setRoomPassword(row.id, key);
          return { id: row.id, title: row.title, masterKey: key };
        });
        send(res, 200, { rooms: out });
        return;
      }

      if (req.method === "DELETE" && parts[2] === "trash") {
        const rows = listRooms.all().filter(function (row) { return row.deleted_at > 0; });
        rows.forEach(function (row) {
          purgeRoom.run(row.id);
          wipeRoomFiles(filesDir, row.id);
        });
        send(res, 200, { ok: true, purged: rows.length });
        return;
      }

      if (req.method === "POST" && parts[2] === "backup") {
        const dir = path.join(backupRoot, "full-" + stamp());
        const result = writeFullBackup(dir);
        send(res, 200, result);
        return;
      }

      if (req.method === "GET" && parts[2] === "rooms" && parts[3] && parts[4] === "backup") {
        await sendBackupDownload(res, parts[3]);
        return;
      }

      if (req.method === "POST" && parts[2] === "rooms" && parts[3] === "restore") {
        const body = await readJson(req, Math.min(ROOM_FILES_MAX + 5_000_000, 200_000_000));
        const key = passOk(body.password) || newSecret().slice(0, 16);
        if (!body.campaign || !campaignOk(body.campaign)) {
          send(res, 400, { error: "bad campaign" });
          return;
        }
        const id = randomUUID();
        const hashed = hashSecret(key);
        const title = String(body.title || "Восстановление").slice(0, 80);
        const fromId = String(body.roomId || body.id || "").replace(/[^\w-]/g, "");
        const campaign = retarget(body.campaign, fromId, id);
        const frame = projectFrame(campaign);
        const now = Date.now();
        insertRoom.run(id, title, hashed.salt, hashed.hash, key, "live", JSON.stringify(campaign), JSON.stringify(frame), now);
        try {
          unpackFiles(filesDir, id, body.files, ROOM_FILES_MAX);
        } catch (err) {
          purgeRoom.run(id);
          wipeRoomFiles(filesDir, id);
          throw err;
        }
        if (Array.isArray(body.rolls)) saveRolls.run(JSON.stringify(body.rolls.slice(0, 40)), id);
        if (Array.isArray(body.pins)) savePins.run(JSON.stringify(body.pins.slice(0, 40)), id);
        send(res, 201, { id: id, title: title, masterKey: key });
        return;
      }

      send(res, 404, { error: "not found" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/rooms") {
      const rooms = [];
      const trash = [];
      listRooms.all().forEach(function (row) {
        const item = { id: row.id, title: row.title, updatedAt: row.updated_at, deletedAt: row.deleted_at || 0 };
        if (item.deletedAt) trash.push(item);
        else rooms.push(item);
      });
      trash.sort(function (a, b) { return b.deletedAt - a.deletedAt; });
      const conf = settings.read();
      send(res, 200, {
        rooms: rooms,
        trash: trash,
        publicCreate: conf.publicCreate !== false
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/rooms") {
      const conf = settings.read();
      if (conf.publicCreate === false && !isAdmin(req)) {
        send(res, 403, { error: "публичное создание комнат выключено" });
        return;
      }
      const body = await readJson(req);
      const title = String(body.title || "Комната").slice(0, 80);
      const key = passOk(body.password);
      if (!key) {
        send(res, 400, { error: "нужен пароль мастера, от 4 символов" });
        return;
      }
      send(res, 201, createRoom(title, key));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/rooms/import") {
      if (!isAdmin(req)) {
        send(res, 403, { error: "загрузка выгрузки только для админа" });
        return;
      }
      const body = await readJson(req, Math.min(ROOM_FILES_MAX + 5_000_000, 200_000_000));
      const key = passOk(body.password) || newSecret().slice(0, 16);
      if (!body.campaign || !campaignOk(body.campaign)) {
        send(res, 400, { error: "bad campaign" });
        return;
      }
      const id = randomUUID();
      const hashed = hashSecret(key);
      const title = String(body.title || "Импорт").slice(0, 80);
      const fromId = String(body.roomId || body.id || "").replace(/[^\w-]/g, "");
      const campaign = retarget(body.campaign, fromId, id);
      const frame = projectFrame(campaign);
      const now = Date.now();
      insertRoom.run(id, title, hashed.salt, hashed.hash, key, "live", JSON.stringify(campaign), JSON.stringify(frame), now);
      try {
        unpackFiles(filesDir, id, body.files, ROOM_FILES_MAX);
      } catch (err) {
        purgeRoom.run(id);
        wipeRoomFiles(filesDir, id);
        throw err;
      }
      if (Array.isArray(body.rolls)) saveRolls.run(JSON.stringify(body.rolls.slice(0, 40)), id);
      if (Array.isArray(body.pins)) savePins.run(JSON.stringify(body.pins.slice(0, 40)), id);
      send(res, 201, { id: id, title: title, masterKey: key });
      return;
    }

    if (parts[0] !== "api" || parts[1] !== "rooms" || !parts[2]) {
      send(res, 404, { error: "not found" });
      return;
    }

    const id = parts[2];
    const room = roomById(id);
    if (!room) {
      send(res, 404, { error: "not found" });
      return;
    }
    if (room.campaign && room.campaign.dungeon) {
      delete room.campaign.dungeon;
      if (room.frame && room.frame.page && room.frame.page.kind === "dungeon") {
        room.frame = projectFrame(room.campaign);
      }
      writeRoom(room);
    }

    const tail = parts.slice(3).join("/");

    if (tail === "plugins" || tail.indexOf("plugins/") === 0) {
      if (!isMaster(req, room)) {
        send(res, 401, { error: "unauthorized" });
        return;
      }
      await handlePlugin({ req, res, room, tail, send, readJson, db, writeRoom });
      return;
    }

    if (req.method === "DELETE" && !tail) {
      if (!isMaster(req, room) && !isAdmin(req)) {
        send(res, 401, { error: "unauthorized" });
        return;
      }
      trashRoom.run(Date.now(), id);
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && tail === "restore") {
      if (!isMaster(req, room) && !isAdmin(req)) {
        send(res, 401, { error: "unauthorized" });
        return;
      }
      restoreRoom.run(id);
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === "DELETE" && tail === "purge") {
      if (!isMaster(req, room) && !isAdmin(req)) {
        send(res, 401, { error: "unauthorized" });
        return;
      }
      purgeRoom.run(id);
      wipeRoomFiles(filesDir, id);
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && tail === "play") {
      const body = await readJson(req, 4000);
      const op = body.op === "enter" || body.op === "turn" || body.op === "fight" ? body.op : "";
      const kind = room.frame && room.frame.page && room.frame.page.kind;
      if (!op || (op === "enter" && kind !== "map") || (op === "fight" && kind !== "map") || (op === "turn" && kind !== "battle")) {
        send(res, 409, { error: "нельзя" });
        return;
      }
      const done = playAction(room.campaign, op, body.id);
      if (!done) {
        send(res, 409, { error: "нельзя" });
        return;
      }
      room.frame = projectFrame(room.campaign);
      writeRoom(room);
      publish(id, { type: "play", op: done.op, id: done.id || "", actorId: done.actorId || "" });
      pushFrame(room);
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && tail === "frame") {
      send(res, 200, room.frame);
      return;
    }

    if (req.method === "GET" && tail === "events") {
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no"
      });
      res.write(`data: ${JSON.stringify({ type: "frame", frame: room.frame })}\n\n`);
      const replayTimer = timerReplay(liveBag(id).timer);
      if (replayTimer) {
        res.write(`data: ${JSON.stringify({ type: "event", event: replayTimer })}\n\n`);
      }
      if (room.clock && room.clock.on) {
        res.write(`data: ${JSON.stringify({ type: "event", event: room.clock })}\n\n`);
      }
      const drop = subscribe(id, res);
      const beat = setInterval(function () { res.write(": ping\n\n"); }, 15000);
      req.on("close", function () {
        clearInterval(beat);
        drop();
      });
      return;
    }

    if (req.method === "GET" && parts[3] === "files" && parts[4]) {
      const fileId = parts[4];
      if (!/^[\w-]+$/.test(fileId)) {
        send(res, 400, { error: "bad file" });
        return;
      }
      const filePath = path.join(filesDir, id, fileId);
      if (!filePath.startsWith(path.join(filesDir, id))) {
        send(res, 400, { error: "bad file" });
        return;
      }
      if (!fs.existsSync(filePath)) {
        send(res, 404, { error: "not found" });
        return;
      }
      let type = "application/octet-stream";
      try { type = fs.readFileSync(filePath + ".type", "utf8").trim() || type; } catch (err) { /* старый файл без типа */ }
      res.writeHead(200, {
        "content-type": type,
        "cache-control": "public, max-age=86400"
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    if (!isMaster(req, room)) {
      send(res, 401, { error: "unauthorized" });
      return;
    }

    if (req.method === "GET" && tail === "campaign") {
      send(res, 200, {
        id: room.id,
        title: room.title,
        publishMode: room.publishMode,
        campaign: room.campaign,
        rolls: room.rolls,
        pins: room.pins,
        filesBytes: roomFilesSize(filesDir, id),
        roomFilesMax: ROOM_FILES_MAX
      });
      return;
    }

    if (req.method === "GET" && tail === "backup") {
      await sendBackupDownload(res, id);
      return;
    }

    if (req.method === "POST" && tail === "password") {
      const body = await readJson(req);
      const next = passOk(body.password);
      if (!next) {
        send(res, 400, { error: "нужен новый пароль, от 4 символов" });
        return;
      }
      if (body.oldPassword != null && String(body.oldPassword) !== "" && !secretMatches(String(body.oldPassword), room.masterSalt, room.masterHash)) {
        send(res, 401, { error: "старый пароль неверный" });
        return;
      }
      setRoomPassword(id, next);
      send(res, 200, { ok: true, masterKey: next });
      return;
    }

    if (req.method === "PUT" && tail === "campaign") {
      const body = await readJson(req);
      if (body.title != null) room.title = String(body.title).slice(0, 80);
      if (body.publishMode === "live" || body.publishMode === "hold") room.publishMode = body.publishMode;
      let portraitMap = {};
      if (body.campaign) {
        if (!campaignOk(body.campaign)) {
          send(res, 400, { error: "bad campaign" });
          return;
        }
        const prevPlugins = room.campaign && room.campaign.plugins;
        room.campaign = body.campaign;
        if (!room.campaign.plugins && prevPlugins) room.campaign.plugins = prevPlugins;
        if (room.campaign.dungeon) delete room.campaign.dungeon;
        if (room.campaign.plugins && typeof room.campaign.plugins === "object") {
          delete room.campaign.plugins.token;
          delete room.campaign.plugins.key;
          if (room.campaign.plugins.light) {
            delete room.campaign.plugins.light.token;
            delete room.campaign.plugins.light.key;
          }
        }
        try { portraitMap = await absorbPortraits(filesDir, id, room.campaign) || {}; } catch (err) { /* внешний портрет остаётся ссылкой */ }
        keepPluginSwitch(room);
      }
      const shown = room.campaign.activePageId === room.campaign.shownPageId;
      const nextFrame = projectFrame(room.campaign);
      const nextKind = nextFrame && nextFrame.page && nextFrame.page.kind;
      const prevKind = room.frame && room.frame.page && room.frame.page.kind;
      const overlay = nextKind === "battle";
      const wasOverlay = prevKind === "battle";
      if (room.publishMode === "live" && (shown || overlay || wasOverlay)) {
        room.frame = nextFrame;
      }
      writeRoom(room);
      if (room.publishMode === "live" && (shown || overlay || wasOverlay)) pushFrame(room);
      send(res, 200, { publishMode: room.publishMode, frame: room.frame, files: portraitMap });
      return;
    }

    if (req.method === "POST" && tail === "show") {
      room.campaign.shownPageId = room.campaign.activePageId;
      room.frame = projectFrame(room.campaign);
      writeRoom(room);
      pushFrame(room);
      send(res, 200, { frame: room.frame });
      return;
    }

    if (req.method === "POST" && tail === "events") {
      const body = await readJson(req);
      const event = {
        id: randomUUID(),
        type: String(body.type || "note").slice(0, 40),
        text: String(body.text || "").slice(0, 200),
        at: Date.now()
      };
      if (body.x != null && body.x !== "") {
        const x = Number(body.x);
        if (Number.isFinite(x)) event.x = Math.min(1, Math.max(0, x));
      }
      if (body.y != null && body.y !== "") {
        const y = Number(body.y);
        if (Number.isFinite(y)) event.y = Math.min(1, Math.max(0, y));
      }
      if (body.look === "rings" || body.look === "flash" || body.look === "lights") event.look = body.look;
      if (event.type === "map-image") {
        const url = safePath(body.url);
        if (!url) {
          send(res, 400, { error: "Нет картинки" });
          return;
        }
        event.url = url;
      }
      if (event.type === "wares" && Array.isArray(body.goods)) {
        event.goods = body.goods.slice(0, 40).map(function (item) {
          const row = {
            name: String(item && item.name || "").slice(0, 80),
            price: String(item && item.price || "").slice(0, 40),
            icon: safePath(item && item.icon),
            note: String(item && item.note || "").slice(0, 400)
          };
          const ink = String(item && item.ink || "").trim().slice(0, 20);
          if (ink) row.ink = ink;
          const rarity = Number(item && item.rarity) || 0;
          if (rarity >= 1 && rarity <= 6) row.rarity = rarity;
          return row;
        }).filter(function (item) { return item.name; });
        const fontSize = Math.round(Number(body.fontSize) || 0);
        if (fontSize >= 12 && fontSize <= 28) event.fontSize = fontSize;
      }
      if (event.type === "wares-font") {
        const fontSize = Math.round(Number(body.fontSize) || 0);
        if (fontSize >= 12 && fontSize <= 28) event.fontSize = fontSize;
      }
      if (event.type === "clock") {
        const shapes = { square: 1, round: 1, narrow: 1, segment: 1 };
        if (body.on !== true) {
          event.on = false;
          room.clock = null;
        } else {
          event.on = true;
          event.size = Math.min(120, Math.max(28, Math.round(Number(body.size) || 48)));
          event.shape = shapes[body.shape] ? body.shape : "square";
          room.clock = { type: "clock", on: true, size: event.size, shape: event.shape };
        }
      }
      if (event.type === "timer") {
        const shapes = { square: 1, round: 1, narrow: 1, segment: 1 };
        if (body.on !== true) {
          event.on = false;
          liveBag(room.id).timer = null;
        } else {
          const size = Math.min(120, Math.max(28, Math.round(Number(body.size) || 40)));
          const shape = shapes[body.shape] ? body.shape : "square";
          const remain = Math.min(24 * 60 * 60 * 1000, Math.max(0, Math.round(Number(body.remain) || 0)));
          const until = Math.round(Number(body.until) || 0);
          const running = body.running === true && until > Date.now() - 1500;
          event.on = true;
          event.running = running;
          event.remain = remain;
          event.until = running ? until : 0;
          event.size = size;
          event.shape = shape;
          event.done = body.done === true && !running;
          const kinds = { sand: 1, magic: 1, smoke: 1, blizzard: 1, fire: 1, flood: 1 };
          event.effect = kinds[body.effect] ? body.effect : "";
          event.linked = body.linked !== false;
          event.fxRun = body.fxRun === true;
          event.power = Math.min(100, Math.max(1, Math.round(Number(body.power) || 50)));
          event.speed = Math.min(100, Math.max(1, Math.round(Number(body.speed) || 40)));
          event.hand = /^#[0-9a-fA-F]{6}$/.test(body.hand || "") ? body.hand : "#f6e7b0";
          event.face = /^#[0-9a-fA-F]{6}$/.test(body.face || "") ? body.face : "#1a140c";
          event.storm = body.storm === true;
          event.digits = body.digits === true;
          event.fxReset = body.fxReset === true;
          event.fight = body.fight === true;
          event.span = Math.min(24 * 60 * 60 * 1000, Math.max(0, Math.round(Number(body.span) || remain)));
          event.endText = String(body.endText || "").slice(0, 400);
          event.endImage = safePath(body.endImage);
          event.back = safePath(body.back);
          liveBag(room.id).timer = {
            type: "timer",
            on: true,
            running: event.running,
            remain: event.remain,
            until: event.until,
            size: event.size,
            shape: event.shape,
            done: event.done,
            effect: event.effect,
            linked: event.linked,
            fxRun: event.fxRun,
            power: event.power,
            speed: event.speed,
            hand: event.hand,
            face: event.face,
            storm: event.storm,
            digits: event.digits,
            span: event.span,
            endText: event.endText,
            endImage: event.endImage,
            back: event.back,
            fight: event.fight
          };
        }
      }
      if (event.type === "die") {
        const roll = body.roll && typeof body.roll === "object" ? body.roll : {};
        const shown = publicRoll(roll);
        event.roll = shown;
        const entry = {
          id: event.id,
          at: event.at,
          text: event.text,
          name: shown.name,
          total: shown.total,
          count: shown.count,
          sides: shown.sides,
          mode: shown.mode
        };
        room.rolls.unshift(entry);
        room.rolls = room.rolls.slice(0, 40);
        saveRolls.run(JSON.stringify(room.rolls), id);
      }
      publish(id, { type: "event", event: event });
      send(res, 202, { event: event, rolls: room.rolls });
      return;
    }

    if (req.method === "POST" && tail === "pins") {
      const body = await readJson(req);
      const pin = pinFrom(body);
      room.pins.unshift(pin);
      room.pins = room.pins.slice(0, 40);
      savePins.run(JSON.stringify(room.pins), id);
      send(res, 201, { pins: room.pins });
      return;
    }

    if (req.method === "DELETE" && parts[3] === "pins" && parts[4]) {
      room.pins = room.pins.filter(function (pin) { return pin.id !== parts[4]; });
      savePins.run(JSON.stringify(room.pins), id);
      send(res, 200, { pins: room.pins });
      return;
    }

    if (req.method === "POST" && tail === "files") {
      const used = roomFilesSize(filesDir, id);
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > FILE_UPLOAD_MAX) {
          send(res, 413, { error: "файл слишком большой" });
          return;
        }
        if (used + size > ROOM_FILES_MAX) {
          send(res, 413, { error: "лимит файлов комнаты: 1 ГБ" });
          return;
        }
        chunks.push(chunk);
      }
      const fileId = randomUUID();
      const dir = path.join(filesDir, id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, fileId), Buffer.concat(chunks));
      fs.writeFileSync(path.join(dir, fileId + ".type"), String(req.headers["content-type"] || "application/octet-stream").slice(0, 80));
      send(res, 201, { id: fileId, url: "/api/rooms/" + id + "/files/" + fileId });
      return;
    }

    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, err.status || 500, { error: err.status ? err.message : "error" });
  }
});

server.listen(port, "0.0.0.0", function () {
  console.log("shirmo api on " + port);
  if (!process.env.ADMIN_PASSWORD) console.warn("ADMIN_PASSWORD не задан — /admin недоступен");
});
