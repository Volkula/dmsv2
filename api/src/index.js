import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
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
const webDir = process.env.WEB_DIR || "";

const selectRoom = db.prepare("SELECT * FROM rooms WHERE id = ?");
const listRooms = db.prepare("SELECT id, title, master_key, updated_at, deleted_at FROM rooms ORDER BY updated_at DESC");
const listRoomCampaigns = db.prepare("SELECT id, title, campaign FROM rooms WHERE deleted_at = 0");
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
const SHEET_RIGHTS = ["hp", "ac", "init", "speed", "name", "stats", "skills", "attacks"];
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
    bag = { timer: null, asks: [] };
    liveState.set(id, bag);
  }
  if (!bag.asks) bag.asks = [];
  return bag;
}

function bookOf(campaign) {
  if (!campaign.codex) campaign.codex = {};
  if (!Array.isArray(campaign.codex.heroes)) campaign.codex.heroes = [];
  if (!Array.isArray(campaign.codex.npcs)) campaign.codex.npcs = [];
  if (!Array.isArray(campaign.cast)) campaign.cast = [];
  if (!Array.isArray(campaign.sheetLog)) campaign.sheetLog = [];
  return campaign.codex;
}

function castRow(campaign, username) {
  bookOf(campaign);
  const name = String(username || "").trim().toLowerCase();
  return campaign.cast.find(function (row) { return row && String(row.username || "").toLowerCase() === name; }) || null;
}

function rightsOf(row) {
  const saved = row && row.rights && typeof row.rights === "object" ? row.rights : null;
  const all = !!(row && row.edit && !saved);
  const out = {};
  SHEET_RIGHTS.forEach(function (key) {
    out[key] = saved ? saved[key] === true : all;
  });
  return out;
}

function heroById(campaign, id) {
  const book = bookOf(campaign);
  return book.heroes.find(function (row) { return row && row.id === id; }) || book.npcs.find(function (row) { return row && row.id === id; }) || null;
}

function publicHero(hero) {
  if (!hero) return null;
  const stats = Array.isArray(hero.stats) ? hero.stats.filter(Boolean).slice(0, 8).map(function (stat) {
    return { id: String(stat.id || "").slice(0, 12), name: String(stat.name || "").slice(0, 20), score: Number(stat.score) || 0, mod: modOf(stat.mod) };
  }) : [];
  const skills = Array.isArray(hero.skills) ? hero.skills.filter(Boolean).slice(0, 24).map(function (skill) {
    return { name: String(skill.name || "").slice(0, 40), bonus: modOf(skill.bonus) };
  }) : [];
  const attacks = Array.isArray(hero.attacks) ? hero.attacks.filter(Boolean).slice(0, 12).map(function (hit) {
    return { name: String(hit.name || "").slice(0, 40), bonus: modOf(hit.bonus), damage: String(hit.damage || "").slice(0, 40) };
  }) : [];
  return {
    id: String(hero.id || ""),
    name: String(hero.name || "Персонаж").slice(0, 80),
    title: String(hero.title || "").slice(0, 120),
    portrait: String(hero.portrait || ""),
    hp: Number(hero.hp) || 0,
    hpMax: Number(hero.hpMax) || 0,
    ac: Number(hero.ac) || 0,
    init: modOf(hero.init),
    speed: String(hero.speed || "").slice(0, 20),
    stats: stats,
    skills: skills,
    attacks: attacks
  };
}

function keepPlayerCast(prev, next) {
  if (!prev || !next) return;
  const oldCast = Array.isArray(prev.cast) ? prev.cast : [];
  if (!Array.isArray(next.cast)) next.cast = oldCast.map(function (row) { return Object.assign({}, row); });
  oldCast.forEach(function (was) {
    if (!was || next.cast.some(function (row) { return row && row.username === was.username; })) return;
    next.cast.push(Object.assign({}, was));
  });
  next.cast.forEach(function (row) {
    if (!row) return;
    const was = oldCast.find(function (item) { return item && item.username === row.username; });
    if (!was) return;
    if ((Number(was.movedAt) || 0) > (Number(row.movedAt) || 0)) {
      row.x = was.x;
      row.y = was.y;
      row.placed = was.placed;
      row.viewId = was.viewId;
      row.focusId = was.focusId;
      row.movedAt = was.movedAt;
    }
    if ((Number(was.rightsAt) || 0) >= (Number(row.rightsAt) || 0)) {
      if (was.rights) row.rights = was.rights;
      row.edit = was.edit === true;
      if (was.rightsAt) row.rightsAt = was.rightsAt;
    }
    if ((Number(was.sizeAt) || 0) >= (Number(row.sizeAt) || 0) && was.size) {
      row.size = was.size;
      row.sizeAt = was.sizeAt;
    }
  });
  if (!next.codex) next.codex = {};
  ["heroes", "npcs"].forEach(function (key) {
    const oldRows = prev.codex && Array.isArray(prev.codex[key]) ? prev.codex[key] : [];
    if (!Array.isArray(next.codex[key])) next.codex[key] = [];
    oldRows.forEach(function (was) {
      if (!was || next.codex[key].some(function (item) { return item && item.id === was.id; })) return;
      next.codex[key].push(was);
    });
    next.codex[key].forEach(function (hero) {
      const was = oldRows.find(function (item) { return item && item.id === hero.id; });
      const fresh = Math.max(Number(was && was.editAt) || 0, Number(was && was.hpAt) || 0);
      const stale = Math.max(Number(hero.editAt) || 0, Number(hero.hpAt) || 0);
      if (was && fresh > stale) {
        ["hp", "hpMax", "ac", "init", "speed", "name", "title", "stats", "skills", "attacks", "editAt", "hpAt"].forEach(function (field) {
          if (was[field] != null) hero[field] = was[field];
        });
      }
    });
  });
  const oldLog = Array.isArray(prev.sheetLog) ? prev.sheetLog : [];
  const nextLog = Array.isArray(next.sheetLog) ? next.sheetLog : [];
  if (oldLog.length > nextLog.length) next.sheetLog = oldLog;
}

function rollDice(body) {
  const mode = body.mode === "advantage" || body.mode === "disadvantage" ? body.mode : "normal";
  const mod = modOf(body.mod);
  const sign = mod > 0 ? "+" + mod : (mod < 0 ? String(mod) : "");
  if (mode !== "normal") {
    const a = 1 + Math.floor(Math.random() * 20);
    const b = 1 + Math.floor(Math.random() * 20);
    const kept = mode === "advantage" ? Math.max(a, b) : Math.min(a, b);
    const total = kept + mod;
    return publicRoll({
      name: body.name,
      count: 2,
      sides: 20,
      mode: mode,
      mod: mod,
      total: total,
      dice: [{ sides: 20, value: a }, { sides: 20, value: b }],
      log: a + " · " + b + " → " + (mod ? kept + sign + "=" + total : total),
      label: (mode === "advantage" ? "Преимущество" : "Помеха") + (sign ? " " + sign : "")
    });
  }
  const sides = DIE_SIDES.indexOf(Number(body.sides)) >= 0 ? Number(body.sides) : 20;
  const count = Math.min(12, Math.max(1, Number(body.count) || 1));
  const dice = [];
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const value = 1 + Math.floor(Math.random() * sides);
    dice.push(value);
    total += value;
  }
  const shown = total + mod;
  const text = count === 1 ? String(dice[0]) : dice.join("+");
  return publicRoll({
    name: body.name,
    count: count,
    sides: sides,
    mode: "normal",
    mod: mod,
    total: shown,
    dice: dice.map(function (value) { return { sides: sides, value: value }; }),
    log: mod ? text + sign + "=" + shown : (count === 1 ? String(shown) : text + "=" + shown),
    label: count + "d" + sides + sign
  });
}

function pushDie(room, roll, text) {
  const event = { id: randomUUID(), type: "die", text: String(text || roll.log || "").slice(0, 200), at: Date.now(), roll: roll };
  room.rolls.unshift({ id: event.id, at: event.at, text: event.text, name: roll.name, total: roll.total, count: roll.count, sides: roll.sides, mode: roll.mode });
  room.rolls = room.rolls.slice(0, 40);
  saveRolls.run(JSON.stringify(room.rolls), room.id);
  publish(room.id, { type: "event", event: event });
}

function applySheetEdit(hero, body, rights) {
  const allow = rights || rightsOf({ edit: true });
  const notes = [];
  function num(key, label, min, max) {
    if (body[key] == null || body[key] === "") return;
    const next = Math.max(min, Math.min(max, Math.round(Number(body[key]) || 0)));
    const prev = Math.round(Number(hero[key]) || 0);
    if (next === prev) return;
    hero[key] = next;
    notes.push(label + " " + prev + " → " + next);
  }
  if (allow.hp) {
    num("hp", "хиты", 0, 999);
    num("hpMax", "макс. хиты", 0, 999);
  }
  if (allow.ac) num("ac", "КД", 0, 40);
  if (allow.init) num("init", "инициатива", -30, 30);
  if (allow.speed && body.speed != null) {
    const speed = String(body.speed).slice(0, 20);
    if (speed !== String(hero.speed || "")) {
      notes.push("скорость " + (hero.speed || "—") + " → " + (speed || "—"));
      hero.speed = speed;
    }
  }
  if (allow.name && body.name != null) {
    const name = String(body.name).trim().slice(0, 80);
    if (name && name !== String(hero.name || "")) {
      notes.push("имя " + (hero.name || "—") + " → " + name);
      hero.name = name;
    }
  }
  if (allow.name && body.title != null) {
    const title = String(body.title).trim().slice(0, 120);
    if (title !== String(hero.title || "")) {
      notes.push("описание");
      hero.title = title;
    }
  }
  if (allow.stats && Array.isArray(body.stats) && Array.isArray(hero.stats)) {
    body.stats.forEach(function (stat) {
      const row = hero.stats.find(function (item) { return item && item.id === stat.id; });
      if (!row) return;
      const score = Math.max(1, Math.min(30, Math.round(Number(stat.score) || 0)));
      if (score === Number(row.score)) return;
      notes.push((row.name || row.id) + " " + row.score + " → " + score);
      row.score = score;
      row.mod = Math.floor((score - 10) / 2);
    });
  }
  if (allow.skills && Array.isArray(body.skills) && Array.isArray(hero.skills)) {
    body.skills.forEach(function (skill) {
      const row = hero.skills.find(function (item) { return item && item.name === skill.name; });
      if (!row) return;
      const bonus = modOf(skill.bonus);
      if (bonus === modOf(row.bonus)) return;
      notes.push(row.name + " " + modOf(row.bonus) + " → " + bonus);
      row.bonus = bonus;
    });
  }
  if (allow.attacks && Array.isArray(body.attacks) && Array.isArray(hero.attacks)) {
    body.attacks.forEach(function (hit, index) {
      const row = hero.attacks[index];
      if (!row || !hit) return;
      const name = String(hit.name || row.name || "").slice(0, 40);
      const bonus = modOf(hit.bonus);
      const damage = String(hit.damage || "").slice(0, 40);
      if (name !== String(row.name || "") || bonus !== modOf(row.bonus) || damage !== String(row.damage || "")) {
        notes.push("атака " + (row.name || index + 1));
        row.name = name || row.name;
        row.bonus = bonus;
        row.damage = damage;
      }
    });
  }
  if (!notes.length) return "";
  hero.editAt = Date.now();
  hero.hpAt = hero.editAt;
  return notes.join(", ");
}

function minePayload(room, username) {
  const row = castRow(room.campaign, username);
  const hero = row ? heroById(room.campaign, row.heroId || row.npcId) : null;
  const asks = liveBag(room.id).asks.filter(function (ask) {
    return ask.until > Date.now() && (ask.user === "*" || ask.user === username);
  });
  const rights = rightsOf(row);
  const bag = liveBag(room.id);
  const arms = (Array.isArray(bag.arms) ? bag.arms : []).filter(function (arm) {
    return arm && (arm.user === username || arm.user === "*");
  }).map(function (arm) {
    return { name: arm.name, mod: arm.mod, dmg: arm.dmg || "" };
  });
  return {
    username: username,
    edit: SHEET_RIGHTS.some(function (key) { return rights[key]; }),
    rights: rights,
    placed: !!(row && row.placed),
    size: row && Number(row.size) || 56,
    tokenCell: !!(room.campaign && room.campaign.tokenCell),
    hero: publicHero(hero),
    asks: asks,
    arms: arms
  };
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

let playKey = "";
function playSecret() {
  if (playKey) return playKey;
  if (process.env.PLAY_SECRET) {
    playKey = process.env.PLAY_SECRET;
    return playKey;
  }
  const file = path.join(dataDir, "play.secret");
  try { playKey = fs.readFileSync(file, "utf8").trim(); } catch (err) { playKey = ""; }
  if (!playKey) {
    playKey = newSecret();
    fs.writeFileSync(file, playKey, { mode: 0o600 });
  }
  return playKey;
}

function cookieOf(req, name) {
  const hit = String(req.headers.cookie || "").split(";").map(function (part) { return part.trim(); }).find(function (part) {
    return part.startsWith(name + "=");
  });
  if (!hit) return "";
  try { return decodeURIComponent(hit.slice(name.length + 1)); } catch (err) { return ""; }
}

function signPlay(roomId) {
  const body = roomId + "." + String(Date.now() + 12 * 60 * 60 * 1000);
  return body + "." + createHmac("sha256", playSecret()).update(body).digest("base64url");
}

function playAllowed(req, roomId) {
  const bits = cookieOf(req, "dms_play").split(".");
  if (bits.length !== 3 || bits[0] !== roomId) return false;
  if (!(Number(bits[1]) > Date.now())) return false;
  const expect = createHmac("sha256", playSecret()).update(bits[0] + "." + bits[1]).digest("base64url");
  const left = Buffer.from(expect);
  const right = Buffer.from(bits[2]);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

const knocks = new Map();
function freshKnocks(roomId) {
  const now = Date.now();
  const rows = [];
  knocks.forEach(function (row, ask) {
    if (now - row.at > 10 * 60 * 1000) knocks.delete(ask);
    else if (row.roomId === roomId && row.state === "wait") rows.push({ id: ask, at: row.at });
  });
  return rows;
}

function playCookie(roomId) {
  return "dms_play=" + signPlay(roomId) + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200";
}

async function seatAllowed(req, roomId) {
  if (playAllowed(req, roomId)) return { ok: true, cookie: "" };
  const user = gateUser(req);
  if (!user) return { ok: false, cookie: "" };
  const info = await lookupAccess(user);
  if (!info) return { ok: false, cookie: "" };
  const listed = info.role === "master" || (info.rooms || []).indexOf(String(roomId).toLowerCase()) >= 0;
  return listed ? { ok: true, cookie: playCookie(roomId) } : { ok: false, cookie: "" };
}

function syncOk(req) {
  const token = process.env.SYNC_TOKEN || "";
  const got = String(req.headers["x-sync-token"] || "");
  if (!token || token.length !== got.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(got));
}

function gateUser(req) {
  return String(req.headers["x-user"] || "").trim().toLowerCase();
}

async function lookupAccess(username) {
  const token = process.env.SYNC_TOKEN || "";
  const base = String(process.env.GATE_URL || "http://tg-gate:8080").replace(/\/$/, "");
  if (!token || !username) return null;
  const response = await fetch(base + "/access/v1/lookup?username=" + encodeURIComponent(username), {
    headers: { "X-Sync-Token": token }
  });
  if (!response.ok) return null;
  return response.json();
}

function htmlEscape(value) {
  return String(value || "").replace(/[&<>"]/g, function (ch) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch];
  });
}

function enterHtml(rooms) {
  const items = rooms.map(function (room) {
    return '<a href="/enter/' + encodeURIComponent(room.id) + '">' + htmlEscape(room.title || "Комната") + "</a>";
  }).join("");
  return "<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Ширма</title><style>body{margin:0;background:#111;color:#eee;font:16px/1.45 system-ui,sans-serif}main{max-width:520px;margin:0 auto;padding:24px 16px}a{display:block;margin:8px 0;padding:12px 14px;background:#1a1a1a;border:1px solid #333;border-radius:12px;color:#fff;text-decoration:none}p{color:#aaa}</style><main><h1>Твои комнаты</h1>" + (items || "<p>Мастер ещё не открыл тебе комнату.</p>") + "</main>";
}

function contentType(file) {
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".woff2": "font/woff2",
    ".ico": "image/x-icon"
  }[path.extname(file).toLowerCase()] || "application/octet-stream";
}

function serveWeb(req, res, url) {
  if (!webDir || (req.method !== "GET" && req.method !== "HEAD")) return false;
  if (url.pathname.startsWith("/api/")) return false;
  let rel = url.pathname;
  try { rel = decodeURIComponent(rel); } catch (err) { return false; }
  if (rel.includes("\0")) return false;
  const root = path.resolve(webDir);
  let file = path.resolve(root, "." + rel);
  if (file !== root && !file.startsWith(root + path.sep)) return false;
  const spa = rel === "/" || rel.startsWith("/m/") || rel.startsWith("/v/") || rel.startsWith("/sheet") || rel === "/admin";
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    if (!spa) return false;
    file = path.join(root, "index.html");
  }
  res.writeHead(200, {
    "content-type": contentType(file),
    "cache-control": path.extname(file).toLowerCase() === ".html" ? "no-cache" : "public, max-age=3600"
  });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  fs.createReadStream(file).pipe(res);
  return true;
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

function attachmentHeader(name) {
  const clean = String(name || "room.shirmo.json").replace(/[\r\n"]/g, "");
  const ascii = clean.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();
  const safe = ascii.length >= 8 ? ascii : "room.shirmo.json";
  return "attachment; filename=\"" + safe + "\"; filename*=UTF-8''" + encodeURIComponent(clean);
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
    "content-disposition": attachmentHeader(name),
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

async function atlasExchange(req, res, room, tail) {
  if (!isMaster(req, room)) {
    send(res, 401, { error: "unauthorized" });
    return;
  }
  const token = process.env.SYNC_TOKEN || "";
  const base = String(process.env.MAP_URL || "http://map:8080").replace(/\/$/, "");
  if (!token) {
    send(res, 503, { error: "синк карты не настроен" });
    return;
  }
  const bits = tail.split("/").filter(Boolean);
  const mapId = bits[1] || "";
  if (req.method !== "GET" && req.method !== "PUT") {
    send(res, 405, { error: "method" });
    return;
  }
  if (req.method === "PUT" && !mapId) {
    send(res, 400, { error: "нет карты" });
    return;
  }
  const path = mapId === "tree"
    ? "/api/sync/tree"
    : (mapId ? "/api/sync/maps/" + encodeURIComponent(mapId) : "/api/sync/maps");
  const init = { method: req.method, headers: { "X-Sync-Token": token, "content-type": "application/json" } };
  if (req.method === "PUT") init.body = JSON.stringify(await readJson(req));
  let response;
  try {
    response = await fetch(base + path, init);
  } catch (err) {
    send(res, 502, { error: "глобальная карта недоступна" });
    return;
  }
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (err) { data = { error: text.slice(0, 200) }; }
  send(res, response.status, data);
}

function roomMaps(campaign) {
  let data = campaign;
  if (typeof campaign === "string") {
    try { data = JSON.parse(campaign); } catch (err) { return []; }
  }
  const pages = data && Array.isArray(data.pages) ? data.pages : [];
  const maps = [];
  const seen = {};
  pages.forEach(function (page) {
    if (!page || page.kind !== "map") return;
    (Array.isArray(page.views) ? page.views : []).forEach(function (view) {
      if (!view || !view.id) return;
      const viewId = String(view.id).toLowerCase();
      const locs = (Array.isArray(view.locations) ? view.locations : []).filter(function (loc) { return loc && loc.id && !loc.trashed; });
      const byId = {};
      locs.forEach(function (loc) { byId[String(loc.id).toLowerCase()] = loc; });
      const marked = {};
      (Array.isArray(view.markers) ? view.markers : []).forEach(function (marker) {
        if (marker && marker.locId) marked[String(marker.locId).toLowerCase()] = true;
      });
      const isMap = {};
      isMap[viewId] = true;
      locs.forEach(function (loc) {
        const id = String(loc.id).toLowerCase();
        const nested = locs.some(function (item) { return String(item.parentId || "").toLowerCase() === id; });
        if (loc.day || loc.night || nested || marked[id]) isMap[id] = true;
      });
      function mapParent(loc) {
        let parent = String(loc.parentId || "").toLowerCase();
        const guard = {};
        while (parent && byId[parent] && !isMap[parent]) {
          if (guard[parent]) break;
          guard[parent] = true;
          parent = String(byId[parent].parentId || "").toLowerCase();
        }
        return parent && isMap[parent] ? parent : viewId;
      }
      if (!seen[viewId]) {
        seen[viewId] = true;
        maps.push({ id: viewId, name: view.name || page.name || "Карта", parentId: "" });
      }
      locs.forEach(function (loc) {
        const id = String(loc.id).toLowerCase();
        if (!isMap[id] || seen[id]) return;
        seen[id] = true;
        maps.push({ id: id, name: loc.name || "Локация", parentId: mapParent(loc) });
      });
    });
  });
  return maps;
}

function importCampaign(body) {
  const key = passOk(body.password) || newSecret().slice(0, 16);
  if (!body.campaign || !campaignOk(body.campaign)) {
    const err = new Error("bad campaign");
    err.status = 400;
    throw err;
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
  return { id: id, title: title, masterKey: key };
}

function roomAdminList() {
  const conf = settings.read();
  return {
    publicCreate: conf.publicCreate !== false,
    roomFilesMax: ROOM_FILES_MAX,
    rooms: listRooms.all().map(function (row) {
      return {
        id: row.id,
        title: row.title,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at || 0,
        filesBytes: roomFilesSize(filesDir, row.id)
      };
    })
  };
}

async function requireMaster(req, res) {
  const user = gateUser(req);
  if (!user) {
    send(res, 401, { error: "login" });
    return "";
  }
  const info = await lookupAccess(user);
  if (!info || info.role !== "master") {
    send(res, 403, { error: "это может мастер" });
    return "";
  }
  return user;
}

async function proxyAccess(res, user, path, body) {
  const token = process.env.SYNC_TOKEN || "";
  const base = String(process.env.GATE_URL || "http://tg-gate:8080").replace(/\/$/, "");
  if (!token) {
    send(res, 503, { error: "синк не задан" });
    return;
  }
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "X-Sync-Token": token,
      "X-User": user,
      "content-type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch (err) {
    payload = { error: text.slice(0, 180) || "доступ не прочитался" };
  }
  send(res, response.status, payload);
}

async function handleDesk(req, res, url) {
  if (!url.pathname.startsWith("/admin/v1")) return false;
  const user = await requireMaster(req, res);
  if (!user) return true;
  const parts = url.pathname.split("/").filter(Boolean);
  const tail = parts.slice(2);

  if (req.method === "GET" && (!tail.length || tail[0] === "me")) {
    send(res, 200, { username: user, role: "master" });
    return true;
  }
  if (req.method === "GET" && tail[0] === "rooms" && !tail[1]) {
    send(res, 200, roomAdminList());
    return true;
  }
  if (req.method === "PUT" && tail[0] === "config") {
    const body = await readJson(req);
    const on = body.publicCreate === true || body.publicCreate === "on" || body.publicCreate === 1 || body.publicCreate === "1";
    const off = body.publicCreate === false || body.publicCreate === "off" || body.publicCreate === 0 || body.publicCreate === "0";
    if (!on && !off) {
      send(res, 400, { error: "publicCreate: true|false" });
      return true;
    }
    send(res, 200, settings.write({ publicCreate: on }));
    return true;
  }
  if (req.method === "POST" && tail[0] === "rooms" && !tail[1]) {
    const body = await readJson(req);
    const title = String(body.title || "Комната").slice(0, 80);
    const key = passOk(body.password) || newSecret().slice(0, 16);
    send(res, 201, createRoom(title, key));
    return true;
  }
  if (req.method === "POST" && tail[0] === "rooms" && tail[1] && tail[2] === "password") {
    const id = tail[1];
    if (!selectRoom.get(id)) {
      send(res, 404, { error: "not found" });
      return true;
    }
    const body = await readJson(req);
    const key = passOk(body.password) || newSecret().slice(0, 16);
    setRoomPassword(id, key);
    send(res, 200, { id: id, masterKey: key });
    return true;
  }
  if (req.method === "POST" && tail[0] === "passwords" && tail[1] === "reset-all") {
    const out = listRooms.all().map(function (row) {
      const key = newSecret().slice(0, 16);
      setRoomPassword(row.id, key);
      return { id: row.id, title: row.title, masterKey: key };
    });
    send(res, 200, { rooms: out });
    return true;
  }
  if (req.method === "DELETE" && tail[0] === "trash") {
    const rows = listRooms.all().filter(function (row) { return row.deleted_at > 0; });
    rows.forEach(function (row) {
      purgeRoom.run(row.id);
      wipeRoomFiles(filesDir, row.id);
    });
    send(res, 200, { ok: true, purged: rows.length });
    return true;
  }
  if (req.method === "POST" && tail[0] === "backup" && !tail[1]) {
    const dir = path.join(backupRoot, "full-" + stamp());
    send(res, 200, writeFullBackup(dir));
    return true;
  }
  if (req.method === "GET" && tail[0] === "rooms" && tail[1] && tail[2] === "backup") {
    await sendBackupDownload(res, tail[1]);
    return true;
  }
  if (req.method === "POST" && tail[0] === "import") {
    const body = await readJson(req, Math.min(ROOM_FILES_MAX + 5_000_000, 200_000_000));
    send(res, 201, importCampaign(body));
    return true;
  }
  if (req.method === "DELETE" && tail[0] === "rooms" && tail[1] && !tail[2]) {
    if (!selectRoom.get(tail[1])) {
      send(res, 404, { error: "not found" });
      return true;
    }
    trashRoom.run(Date.now(), tail[1]);
    send(res, 200, { ok: true });
    return true;
  }
  if (req.method === "POST" && tail[0] === "rooms" && tail[1] && tail[2] === "restore") {
    if (!selectRoom.get(tail[1])) {
      send(res, 404, { error: "not found" });
      return true;
    }
    restoreRoom.run(tail[1]);
    send(res, 200, { ok: true });
    return true;
  }
  if (req.method === "DELETE" && tail[0] === "rooms" && tail[1] && tail[2] === "purge") {
    if (!selectRoom.get(tail[1])) {
      send(res, 404, { error: "not found" });
      return true;
    }
    purgeRoom.run(tail[1]);
    wipeRoomFiles(filesDir, tail[1]);
    send(res, 200, { ok: true });
    return true;
  }
  if (req.method === "GET" && tail[0] === "access" && !tail[1]) {
    await proxyAccess(res, user, "/access/v1/board");
    return true;
  }
  if (req.method === "POST" && tail[0] === "access" && (tail[1] === "grants" || tail[1] === "hide")) {
    const body = await readJson(req);
    await proxyAccess(res, user, "/access/v1/" + tail[1], body || {});
    return true;
  }
  send(res, 404, { error: "not found" });
  return true;
}

const server = http.createServer(async function (req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    if (serveWeb(req, res, url)) return;
    if (await handleDesk(req, res, url)) return;
    const parts = url.pathname.split("/").filter(Boolean);

    if (req.method === "GET" && url.pathname === "/who") {
      const user = gateUser(req);
      if (!user) {
        send(res, 401, { error: "login" });
        return;
      }
      const info = await lookupAccess(user);
      if (!info) {
        send(res, 502, { error: "доступ не прочитался" });
        return;
      }
      const alive = listRooms.all().filter(function (row) { return !row.deleted_at; });
      const mine = info.role === "master"
        ? alive
        : alive.filter(function (row) { return (info.rooms || []).indexOf(String(row.id).toLowerCase()) >= 0; });
      send(res, 200, {
        username: user,
        role: info.role === "master" ? "master" : "player",
        rooms: mine.map(function (row) { return { id: row.id, title: row.title || "Комната" }; })
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/me/sheets") {
      const user = gateUser(req);
      if (!user) {
        send(res, 401, { error: "login" });
        return;
      }
      const info = await lookupAccess(user);
      if (!info) {
        send(res, 502, { error: "доступ не прочитался" });
        return;
      }
      const alive = listRooms.all().filter(function (row) { return !row.deleted_at; });
      const mine = info.role === "master"
        ? alive
        : alive.filter(function (row) { return (info.rooms || []).indexOf(String(row.id).toLowerCase()) >= 0; });
      const sheets = [];
      mine.forEach(function (row) {
        const room = roomById(row.id);
        if (!room || !room.campaign) return;
        const cast = castRow(room.campaign, user);
        if (!cast) return;
        const hero = heroById(room.campaign, cast.heroId || cast.npcId);
        sheets.push({
          roomId: room.id,
          title: room.title || "Комната",
          name: hero && hero.name || user,
          edit: SHEET_RIGHTS.some(function (key) { return rightsOf(cast)[key]; })
        });
      });
      send(res, 200, { username: user, sheets: sheets });
      return;
    }

    if (req.method === "GET" && (url.pathname === "/enter" || url.pathname.startsWith("/enter/"))) {
      const user = gateUser(req);
      if (!user) {
        send(res, 401, { error: "login" });
        return;
      }
      const info = await lookupAccess(user);
      if (!info) {
        res.writeHead(502, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end("<p>Доступ сейчас не прочитался.</p>");
        return;
      }
      const alive = listRooms.all().filter(function (row) { return !row.deleted_at; });
      const mine = info.role === "master"
        ? alive
        : alive.filter(function (row) { return (info.rooms || []).indexOf(String(row.id).toLowerCase()) >= 0; });
      const wanted = parts[1] || "";
      if (!wanted) {
        if (mine.length === 1) {
          res.writeHead(302, { Location: "/enter/" + mine[0].id, "cache-control": "no-store" });
          res.end();
          return;
        }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(enterHtml(mine));
        return;
      }
      const room = mine.find(function (row) { return String(row.id).toLowerCase() === wanted.toLowerCase(); });
      if (!room) {
        res.writeHead(403, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end("<p>Эта комната тебе не открыта.</p>");
        return;
      }
      res.writeHead(302, { Location: "/v/" + room.id, "Set-Cookie": playCookie(room.id), "cache-control": "no-store" });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/internal/rooms") {
      if (!syncOk(req)) {
        send(res, 401, { error: "синк не принят" });
        return;
      }
      send(res, 200, {
        rooms: listRoomCampaigns.all().map(function (row) {
          return {
            id: row.id,
            title: row.title || "Комната",
            maps: roomMaps(row.campaign)
          };
        })
      });
      return;
    }

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
      send(res, 201, importCampaign(body));
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

    if (tail === "atlas" || tail.indexOf("atlas/") === 0) {
      await atlasExchange(req, res, room, tail);
      return;
    }

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
      if (!isMaster(req, room) && !playAllowed(req, id)) {
        send(res, 401, { error: "ждите мастера" });
        return;
      }
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

    if (req.method === "POST" && tail === "knock") {
      if (freshKnocks(id).length >= 8) {
        send(res, 429, { error: "слишком много запросов" });
        return;
      }
      const ask = randomUUID();
      knocks.set(ask, { roomId: id, at: Date.now(), state: "wait" });
      send(res, 200, { ask: ask });
      return;
    }

    if (req.method === "GET" && parts[3] === "knock" && parts[4]) {
      const row = knocks.get(parts[4]);
      if (!row || row.roomId !== id) {
        send(res, 404, { error: "запрос пропал" });
        return;
      }
      if (row.state === "yes") {
        knocks.delete(parts[4]);
        send(res, 200, { ok: true }, { "set-cookie": playCookie(id) });
        return;
      }
      if (row.state === "no") {
        knocks.delete(parts[4]);
        send(res, 200, { no: true });
        return;
      }
      send(res, 200, { ok: false });
      return;
    }

    if (req.method === "GET" && tail === "knocks") {
      if (!isMaster(req, room)) {
        send(res, 401, { error: "unauthorized" });
        return;
      }
      send(res, 200, { asks: freshKnocks(id) });
      return;
    }

    if (req.method === "POST" && parts[3] === "knocks" && parts[4]) {
      if (!isMaster(req, room)) {
        send(res, 401, { error: "unauthorized" });
        return;
      }
      const row = knocks.get(parts[4]);
      if (!row || row.roomId !== id) {
        send(res, 404, { error: "запрос пропал" });
        return;
      }
      const body = await readJson(req, 2000);
      row.state = body.allow ? "yes" : "no";
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && tail === "frame") {
      if (!isMaster(req, room) && !playAllowed(req, id)) {
        send(res, 401, { error: "ждите мастера" });
        return;
      }
      send(res, 200, room.frame);
      return;
    }

    if (req.method === "GET" && tail === "events") {
      if (!isMaster(req, room) && !playAllowed(req, id)) {
        send(res, 401, { error: "ждите мастера" });
        return;
      }
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
      const replayClock = liveBag(id).clock;
      if (replayClock && replayClock.on) {
        res.write(`data: ${JSON.stringify({ type: "event", event: replayClock })}\n\n`);
      }
      liveBag(id).asks = liveBag(id).asks.filter(function (ask) { return ask.until > Date.now(); });
      liveBag(id).asks.forEach(function (ask) {
        res.write(`data: ${JSON.stringify({ type: "event", event: ask })}\n\n`);
      });
      const replayEdge = liveBag(id).frame;
      if (replayEdge && replayEdge.on) {
        res.write(`data: ${JSON.stringify({ type: "event", event: replayEdge })}\n\n`);
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

    if (req.method === "GET" && tail === "mine") {
      const user = gateUser(req);
      const seat = await seatAllowed(req, id);
      if (!user || (!isMaster(req, room) && !seat.ok)) {
        send(res, 401, { error: "unauthorized" });
        return;
      }
      send(res, 200, minePayload(room, user), seat.cookie ? { "set-cookie": seat.cookie } : undefined);
      return;
    }

    if (req.method === "PUT" && tail === "mine") {
      const user = gateUser(req);
      const seat = await seatAllowed(req, id);
      const row = user && castRow(room.campaign, user);
      const rights = rightsOf(row);
      if (!user || !seat.ok || !row || !SHEET_RIGHTS.some(function (key) { return rights[key]; })) {
        send(res, 403, { error: "лист только для чтения" });
        return;
      }
      const body = await readJson(req);
      const hero = heroById(room.campaign, row.heroId || row.npcId);
      if (!hero) {
        send(res, 404, { error: "нет листа" });
        return;
      }
      const text = applySheetEdit(hero, body || {}, rights);
      if (text) {
        bookOf(room.campaign);
        room.campaign.sheetLog.unshift({ at: hero.editAt, user: user, name: hero.name || user, text: text });
        room.campaign.sheetLog = room.campaign.sheetLog.slice(0, 80);
        writeRoom(room);
        room.frame = projectFrame(room.campaign);
        if (room.publishMode === "live") pushFrame(room);
        publish(room.id, { type: "sheet", heroId: hero.id, hp: hero.hp, hpAt: hero.hpAt });
      }
      send(res, 200, minePayload(room, user));
      return;
    }

    if (req.method === "POST" && tail === "token") {
      const user = gateUser(req);
      const seat = await seatAllowed(req, id);
      const row = user && castRow(room.campaign, user);
      if (!user || !seat.ok || !row) {
        send(res, 403, { error: "нет персонажа" });
        return;
      }
      const body = await readJson(req);
      let markerId = "";
      let markerSize = 0;
      if (body.x != null && body.y != null) {
        row.x = Math.min(1, Math.max(0, Number(body.x) || 0));
        row.y = Math.min(1, Math.max(0, Number(body.y) || 0));
        row.placed = body.placed !== false;
        row.viewId = String(body.viewId || "").slice(0, 80);
        row.focusId = String(body.focusId || "").slice(0, 80);
        row.movedAt = Date.now();
      }
      if (body.size != null && !(room.campaign && room.campaign.tokenCell)) {
        row.size = Math.min(180, Math.max(28, Math.round(Number(body.size) || 56)));
        row.sizeAt = Date.now();
        markerSize = row.size;
      }
      if (body.move || markerSize) {
        const pages = Array.isArray(room.campaign.pages) ? room.campaign.pages : [];
        pages.forEach(function (page) {
          (Array.isArray(page && page.views) ? page.views : []).forEach(function (view) {
            if (row.viewId && view && view.id !== row.viewId) return;
            (Array.isArray(view && view.markers) ? view.markers : []).forEach(function (marker) {
              if (!marker || (marker.locId || "") !== row.focusId) return;
              const same = (row.heroId && marker.heroId === row.heroId) || (row.npcId && marker.npcId === row.npcId);
              if (!same) return;
              if (body.move) {
                marker.x = row.x;
                marker.y = row.y;
              }
              if (markerSize) marker.pinSize = markerSize;
              markerId = String(marker.id || "");
            });
          });
        });
      }
      writeRoom(room);
      room.frame = projectFrame(room.campaign);
      if (room.publishMode === "live") pushFrame(room);
      publish(room.id, { type: "cast", cast: { username: row.username, x: row.x, y: row.y, placed: row.placed, viewId: row.viewId, focusId: row.focusId, movedAt: row.movedAt, size: row.size || 0 }, marker: markerId ? { id: markerId, x: row.x, y: row.y, pinSize: markerSize || undefined } : null });
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && tail === "roll") {
      const user = gateUser(req);
      const seat = await seatAllowed(req, id);
      if (!user || (!isMaster(req, room) && !seat.ok)) {
        send(res, 401, { error: "unauthorized" });
        return;
      }
      const body = await readJson(req);
      const row = castRow(room.campaign, user);
      const hero = row ? heroById(room.campaign, row.heroId || row.npcId) : null;
      const roll = rollDice(body || {});
      roll.name = String((hero && hero.name) || user) + (roll.name ? ": " + roll.name : "");
      const asked = String((body && body.name) || "");
      const bag = liveBag(room.id);
      const before = Array.isArray(bag.arms) ? bag.arms.length : 0;
      bag.arms = (Array.isArray(bag.arms) ? bag.arms : []).filter(function (arm) {
        return !(arm && (arm.user === user || arm.user === "*") && arm.name === asked);
      });
      if (bag.arms.length !== before) {
        publish(room.id, { type: "event", event: { type: "arm", user: user, name: asked, on: false } });
      }
      pushDie(room, roll, roll.name + " " + roll.log);
      send(res, 200, { roll: roll });
      return;
    }

    if (req.method === "GET" && tail === "pins") {
      const user = gateUser(req);
      const seat = await seatAllowed(req, id);
      if (!user || (!isMaster(req, room) && !seat.ok)) {
        send(res, 401, { error: "unauthorized" });
        return;
      }
      const pins = (Array.isArray(room.pins) ? room.pins : []).map(function (pin) {
        return {
          id: pin.id,
          name: pin.name || "",
          count: pin.count || 1,
          sides: pin.sides || 20,
          mode: pin.mode || "normal",
          mod: pin.mod || 0
        };
      });
      send(res, 200, { pins: pins });
      return;
    }

    if (!isMaster(req, room)) {
      send(res, 401, { error: "unauthorized" });
      return;
    }

    if (req.method === "GET" && tail === "sheet") {
      const who = String(url.searchParams.get("user") || "").trim().toLowerCase();
      const row = castRow(room.campaign, who);
      const hero = row ? heroById(room.campaign, row.heroId || row.npcId) : null;
      send(res, 200, { username: who, edit: !!(row && row.edit), hero: publicHero(hero) });
      return;
    }

    if (req.method === "GET" && tail === "cast") {
      const book = bookOf(room.campaign);
      send(res, 200, {
        cast: room.campaign.cast,
        heroes: book.heroes.map(function (hero) { return { id: hero.id, name: hero.name || "Герой" }; }),
        npcs: book.npcs.map(function (npc) { return { id: npc.id, name: npc.name || "НПС" }; }),
        log: room.campaign.sheetLog,
        tokenCell: room.campaign.tokenCell === true
      });
      return;
    }

    if (req.method === "POST" && tail === "cast") {
      const body = await readJson(req);
      const username = String(body.username || "").trim().toLowerCase();
      if (!/^[a-z][a-z0-9._-]{1,31}$/.test(username)) {
        send(res, 400, { error: "нужен логин игрока" });
        return;
      }
      const book = bookOf(room.campaign);
      let row = castRow(room.campaign, username);
      if (!row) {
        row = { username: username, heroId: "", npcId: "", edit: false, placed: false, x: 0.5, y: 0.5, viewId: "", focusId: "", movedAt: 0 };
        room.campaign.cast.push(row);
      }
      if (body.hero && typeof body.hero === "object") {
        const hero = body.hero;
        const id = randomUUID();
        const face = safePath(hero.portrait) || "";
        book.heroes.push(Object.assign({}, hero, { id: id, name: String(hero.name || "Герой").slice(0, 80), portrait: face }));
        row.heroId = id;
        row.npcId = "";
      } else if (body.heroId) {
        row.heroId = String(body.heroId).slice(0, 80);
        row.npcId = "";
      } else if (body.npcId) {
        row.npcId = String(body.npcId).slice(0, 80);
        row.heroId = "";
      }
      if (body.rights && typeof body.rights === "object") {
        const next = {};
        SHEET_RIGHTS.forEach(function (key) { next[key] = body.rights[key] === true; });
        row.rights = next;
        row.edit = SHEET_RIGHTS.some(function (key) { return next[key]; });
        row.rightsAt = Date.now();
      } else if (body.edit != null) {
        row.edit = body.edit === true;
        const next = {};
        SHEET_RIGHTS.forEach(function (key) { next[key] = row.edit; });
        row.rights = next;
        row.rightsAt = Date.now();
      }
      if (body.portrait) {
        const who = heroById(room.campaign, row.heroId || row.npcId);
        const face = safePath(body.portrait) || (String(body.portrait).startsWith("/tokens/") ? "/tokens/pawn.svg" : "");
        if (who && face) who.portrait = face;
      }
      writeRoom(room);
      room.frame = projectFrame(room.campaign);
      if (room.publishMode === "live") pushFrame(room);
      send(res, 200, { ok: true, cast: room.campaign.cast });
      return;
    }

    if (req.method === "DELETE" && tail === "cast") {
      const body = await readJson(req);
      const username = String(body.username || "").trim().toLowerCase();
      bookOf(room.campaign);
      room.campaign.cast = room.campaign.cast.filter(function (row) { return !row || row.username !== username; });
      writeRoom(room);
      room.frame = projectFrame(room.campaign);
      if (room.publishMode === "live") pushFrame(room);
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && tail === "ask") {
      const body = await readJson(req);
      const user = body.user === "*" ? "*" : String(body.user || "").trim().toLowerCase();
      if (!user) {
        send(res, 400, { error: "нет игрока" });
        return;
      }
      const ask = {
        id: randomUUID(),
        type: "ask-roll",
        user: user,
        name: String(body.name || "Проверка").slice(0, 80),
        mod: modOf(body.mod),
        until: Date.now() + 10000,
        at: Date.now()
      };
      const bag = liveBag(room.id);
      bag.asks = bag.asks.filter(function (item) { return item.until > Date.now(); });
      bag.asks.push(ask);
      publish(room.id, { type: "event", event: ask });
      send(res, 200, { ok: true, ask: ask });
      return;
    }

    if (req.method === "POST" && tail === "arm") {
      const body = await readJson(req);
      const user = body.user === "*" ? "*" : String(body.user || "").trim().toLowerCase();
      const name = String(body.name || "Проверка").slice(0, 80);
      const mod = modOf(body.mod);
      const bag = liveBag(room.id);
      bag.arms = (Array.isArray(bag.arms) ? bag.arms : []).filter(function (arm) {
        return !(arm && arm.user === user && arm.name === name && modOf(arm.mod) === mod);
      });
      const on = body.on !== false;
      if (on && user) {
        bag.arms.push({
          user: user,
          name: name,
          mod: mod,
          sides: DIE_SIDES.indexOf(Number(body.sides)) >= 0 ? Number(body.sides) : 20,
          count: Math.min(12, Math.max(1, Number(body.count) || 1)),
          dmg: String(body.dmg || "").slice(0, 40)
        });
      }
      publish(room.id, { type: "event", event: { type: "arm", user: user, name: name, mod: mod, on: on, dmg: String(body.dmg || "") } });
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && tail === "token-cell") {
      const body = await readJson(req);
      room.campaign.tokenCell = body.on === true;
      writeRoom(room);
      room.frame = projectFrame(room.campaign);
      if (room.publishMode === "live") pushFrame(room);
      send(res, 200, { ok: true, tokenCell: room.campaign.tokenCell });
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
        const prevCampaign = room.campaign;
        room.campaign = body.campaign;
        keepPlayerCast(prevCampaign, room.campaign);
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
      const beatSeq = Math.round(Number(body.seq) || 0);
      const beatKey = event.type === "clock" ? "clockSeq" : event.type === "timer" ? "timerSeq" : event.type === "place-frame" ? "frameSeq" : "";
      const beatBag = beatKey ? liveBag(room.id) : null;
      const staleBeat = !!(beatBag && beatSeq && beatBag[beatKey] && beatSeq < beatBag[beatKey]);
      if (beatBag && beatSeq && !staleBeat) beatBag[beatKey] = beatSeq;
      if (!staleBeat && event.type === "clock") {
        const shapes = { square: 1, round: 1, narrow: 1, segment: 1 };
        if (body.on !== true) {
          event.on = false;
          liveBag(room.id).clock = null;
        } else {
          event.on = true;
          event.size = Math.min(120, Math.max(28, Math.round(Number(body.size) || 48)));
          event.shape = shapes[body.shape] ? body.shape : "square";
          liveBag(room.id).clock = { type: "clock", on: true, size: event.size, shape: event.shape };
        }
      }
      if (!staleBeat && event.type === "place-frame") {
        if (body.on !== true) {
          event.on = false;
          liveBag(room.id).frame = null;
        } else {
          event.on = true;
          event.color = /^#[0-9a-fA-F]{6}$/.test(body.color || "") ? body.color : "#e6c36a";
          event.alpha = Math.min(1, Math.max(0, Number(body.alpha) || 0));
          liveBag(room.id).frame = { type: "place-frame", on: true, color: event.color, alpha: event.alpha };
        }
      }
      if (!staleBeat && event.type === "timer") {
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
      if (!staleBeat) publish(id, { type: "event", event: event });
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
    console.error(err && err.stack || err);
    const message = String(err && err.message || "error").slice(0, 180);
    send(res, err.status || 500, { error: err.status ? err.message : message });
  }
});

server.listen(port, "0.0.0.0", function () {
  console.log("shirmo api on " + port);
  if (!process.env.ADMIN_PASSWORD) console.warn("ADMIN_PASSWORD не задан — /api/admin без пароля");
});
