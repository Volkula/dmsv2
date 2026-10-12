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
const insertRoom = db.prepare(`
  INSERT INTO rooms (id, title, master_salt, master_hash, publish_mode, campaign, frame, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const saveRoom = db.prepare(`
  UPDATE rooms
  SET title = ?, publish_mode = ?, campaign = ?, frame = ?, updated_at = ?
  WHERE id = ?
`);
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

function readJson(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    let size = 0;
    req.on("data", function (chunk) {
      size += chunk.length;
      if (size > 2_000_000) {
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

function roomById(id) {
  return rowToRoom(selectRoom.get(id));
}

function isMaster(req, room) {
  return secretMatches(bearer(req), room.masterSalt, room.masterHash);
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

    if (req.method === "POST" && url.pathname === "/api/rooms") {
      const body = await readJson(req);
      const title = String(body.title || "Комната").slice(0, 80);
      const id = randomUUID();
      const key = newSecret();
      const hashed = hashSecret(key);
      const pageId = randomUUID();
      const campaign = blankCampaign(pageId);
      const frame = projectFrame(campaign);
      const now = Date.now();
      insertRoom.run(id, title, hashed.salt, hashed.hash, "live", JSON.stringify(campaign), JSON.stringify(frame), now);
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
