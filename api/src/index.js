import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { openDb, rowToRoom } from "./db.js";
import { bearer, hashSecret, newSecret, secretMatches } from "./auth.js";
import { publish, subscribe } from "./hub.js";
import { blankCampaign, campaignOk, projectFrame } from "./frame.js";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const port = Number(process.env.PORT || 8080);
const db = openDb(dataDir);
const filesDir = path.join(dataDir, "files");

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
const trashRoom = db.prepare("UPDATE rooms SET deleted_at = ? WHERE id = ?");
const restoreRoom = db.prepare("UPDATE rooms SET deleted_at = 0 WHERE id = ?");
const saveRolls = db.prepare("UPDATE rooms SET roll_log = ? WHERE id = ?");
const savePins = db.prepare("UPDATE rooms SET roll_pins = ? WHERE id = ?");

const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100];

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
    dice: dice,
    color: hexColor(roll.color),
    texture: safePath(roll.texture),
    speed: Number.isFinite(speed) ? Math.min(2.5, Math.max(0.4, speed)) : 1,
    animate: roll.animate !== false
  };
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
    texture: safePath(body.texture)
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

function packFiles(roomId) {
  const dir = path.join(filesDir, roomId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(function (name) {
    return !name.endsWith(".type");
  }).map(function (name) {
    let type = "application/octet-stream";
    try { type = fs.readFileSync(path.join(dir, name + ".type"), "utf8").trim() || type; } catch (err) { /* нет типа */ }
    return {
      id: name,
      type: type.slice(0, 80),
      data: fs.readFileSync(path.join(dir, name)).toString("base64")
    };
  });
}

function unpackFiles(roomId, files) {
  const dir = path.join(filesDir, roomId);
  fs.mkdirSync(dir, { recursive: true });
  (Array.isArray(files) ? files : []).slice(0, 200).forEach(function (file) {
    const fileId = String(file && file.id || "").replace(/[^\w-]/g, "");
    if (!fileId || !file.data) return;
    const buf = Buffer.from(String(file.data), "base64");
    if (buf.length > 8_000_000) return;
    fs.writeFileSync(path.join(dir, fileId), buf);
    fs.writeFileSync(path.join(dir, fileId + ".type"), String(file.type || "application/octet-stream").slice(0, 80));
  });
}

function roomById(id) {
  return rowToRoom(selectRoom.get(id));
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

const server = http.createServer(async function (req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);

    if (req.method === "GET" && url.pathname === "/api/health") {
      send(res, 200, { ok: true });
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
      send(res, 200, { rooms: rooms, trash: trash });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/rooms") {
      const body = await readJson(req);
      const title = String(body.title || "Комната").slice(0, 80);
      const key = passOk(body.password);
      if (!key) {
        send(res, 400, { error: "нужен пароль мастера, от 4 символов" });
        return;
      }
      const id = randomUUID();
      const hashed = hashSecret(key);
      const pageId = randomUUID();
      const campaign = blankCampaign(pageId);
      const frame = projectFrame(campaign);
      const now = Date.now();
      insertRoom.run(id, title, hashed.salt, hashed.hash, key, "live", JSON.stringify(campaign), JSON.stringify(frame), now);
      send(res, 201, { id: id, title: title, masterKey: key });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/rooms/import") {
      const body = await readJson(req, 40_000_000);
      const key = passOk(body.password);
      if (!key) {
        send(res, 400, { error: "нужен пароль мастера, от 4 символов" });
        return;
      }
      if (!body.campaign || !campaignOk(body.campaign)) {
        send(res, 400, { error: "bad campaign" });
        return;
      }
      const id = randomUUID();
      const hashed = hashSecret(key);
      const title = String(body.title || "Импорт").slice(0, 80);
      const campaign = body.campaign;
      const frame = projectFrame(campaign);
      const now = Date.now();
      insertRoom.run(id, title, hashed.salt, hashed.hash, key, "live", JSON.stringify(campaign), JSON.stringify(frame), now);
      unpackFiles(id, body.files);
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

    const tail = parts.slice(3).join("/");

    if (req.method === "DELETE" && !tail) {
      if (!isMaster(req, room)) {
        send(res, 401, { error: "unauthorized" });
        return;
      }
      trashRoom.run(Date.now(), id);
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && tail === "restore") {
      if (!isMaster(req, room)) {
        send(res, 401, { error: "unauthorized" });
        return;
      }
      restoreRoom.run(id);
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
        pins: room.pins
      });
      return;
    }

    if (req.method === "GET" && tail === "backup") {
      send(res, 200, {
        title: room.title,
        campaign: room.campaign,
        rolls: room.rolls,
        pins: room.pins,
        files: packFiles(id)
      });
      return;
    }

    if (req.method === "PUT" && tail === "campaign") {
      const body = await readJson(req);
      if (body.title != null) room.title = String(body.title).slice(0, 80);
      if (body.publishMode === "live" || body.publishMode === "hold") room.publishMode = body.publishMode;
      if (body.campaign) {
        if (!campaignOk(body.campaign)) {
          send(res, 400, { error: "bad campaign" });
          return;
        }
        room.campaign = body.campaign;
      }
      const shown = room.campaign.activePageId === room.campaign.shownPageId;
      if (room.publishMode === "live" && shown) {
        room.frame = projectFrame(room.campaign);
      }
      writeRoom(room);
      if (room.publishMode === "live" && shown) pushFrame(room);
      send(res, 200, { publishMode: room.publishMode, frame: room.frame });
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
      if (event.type === "wares" && Array.isArray(body.goods)) {
        event.goods = body.goods.slice(0, 40).map(function (item) {
          return {
            name: String(item && item.name || "").slice(0, 80),
            price: String(item && item.price || "").slice(0, 40),
            icon: safePath(item && item.icon)
          };
        }).filter(function (item) { return item.name; });
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
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8_000_000) {
          send(res, 413, { error: "too big" });
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
});
