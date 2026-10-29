import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { plainMatches, secretMatches } from "./auth.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const releaseUrls = [
  process.env.PLUGIN_RELEASE || "https://github.com/Volkula/shirmo-light/releases/latest/download/plugin.json",
  process.env.MELK_RELEASE || "https://github.com/Volkula/shirmo-melk/releases/latest/download/plugin.json"
];

const FX_SCENE = {
  sand: ["candle"],
  magic: ["fantasy"],
  smoke: ["night"],
  blizzard: ["night"],
  fire: ["candle", "sunrise"],
  flood: ["ocean"]
};

function catalogEntry(body, src) {
  if (!body || !/^[a-z0-9-]{2,40}$/.test(body.id || "") || !body.name) return null;
  const main = String(body.main || "plugin.js");
  if (!/^[a-z0-9._-]+$/i.test(main)) return null;
  return {
    id: body.id,
    name: String(body.name).slice(0, 80),
    version: String(body.version || "1").slice(0, 20),
    src: src ? String(src).replace(/[^/]+$/, main) : ""
  };
}

function readBundledFile(name) {
  try {
    return catalogEntry(JSON.parse(fs.readFileSync(path.join(here, "bundled", name), "utf8")), "");
  } catch (err) { /* локальной карточки может не быть */ }
  return null;
}

function pushCatalog(list, entry) {
  if (!entry || !entry.id) return;
  if (list.some(function (item) { return item.id === entry.id; })) return;
  list.push(entry);
}

export async function pluginCatalog() {
  const list = [];
  const entries = await Promise.all(releaseUrls.map(function (url) {
    return fetch(url, { signal: AbortSignal.timeout(4000) }).then(function (response) {
      if (!response.ok) return null;
      return response.json().then(function (body) { return catalogEntry(body, url); });
    }).catch(function () { return null; });
  }));
  entries.forEach(function (entry) { pushCatalog(list, entry); });
  pushCatalog(list, readBundledFile("adaptive-light.json"));
  pushCatalog(list, readBundledFile("light-show.json"));
  return list;
}

function pluginBag(room) {
  const campaign = room.campaign;
  if (!campaign.plugins || typeof campaign.plugins !== "object" || Array.isArray(campaign.plugins)) campaign.plugins = {};
  if (!Array.isArray(campaign.plugins.installed)) campaign.plugins.installed = [];
  if (!campaign.plugins.light || typeof campaign.plugins.light !== "object") campaign.plugins.light = { auto: true, devices: [] };
  if (!Array.isArray(campaign.plugins.light.devices)) campaign.plugins.light.devices = [];
  if (campaign.plugins.light.auto == null) campaign.plugins.light.auto = true;
  delete campaign.plugins.token;
  delete campaign.plugins.key;
  delete campaign.plugins.light.token;
  return campaign.plugins;
}

function keyOf(masterKey) {
  return scryptSync(String(masterKey || ""), "shirmo-light-v1", 32);
}

function seal(masterKey, text) {
  const nonceIv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(masterKey), nonceIv);
  const enc = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { nonce: Buffer.concat([nonceIv, tag]).toString("base64url"), secret: enc.toString("base64url") };
}

function openSecret(masterKey, nonce, secret) {
  const raw = Buffer.from(String(nonce || ""), "base64url");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12);
  const decipher = createDecipheriv("aes-256-gcm", keyOf(masterKey), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(String(secret || ""), "base64url")), decipher.final()]).toString("utf8");
}

function passwordOk(room, password) {
  const text = String(password || "");
  if (secretMatches(text, room.masterSalt, room.masterHash)) return true;
  return plainMatches(text, room.masterKey);
}

function hasSecret(db, roomId, pluginId) {
  const row = db.prepare("SELECT 1 AS ok FROM room_secrets WHERE room_id = ? AND plugin_id = ?").get(roomId, pluginId);
  return !!row;
}

function readToken(db, room) {
  const row = db.prepare("SELECT nonce, secret FROM room_secrets WHERE room_id = ? AND plugin_id = ?").get(room.id, "adaptive-light");
  if (!row || !room.masterKey) return "";
  try {
    return openSecret(room.masterKey, row.nonce, row.secret);
  } catch (err) {
    return "";
  }
}

function publicState(db, room, catalog) {
  const bag = pluginBag(room);
  return {
    catalog: catalog,
    installed: bag.installed.map(function (row) {
      const known = catalog.find(function (item) { return item.id === row.id; });
      return { id: row.id, name: (known && known.name) || row.name || "", on: row.on === true };
    }),
    hasKey: hasSecret(db, room.id, "adaptive-light"),
    auto: bag.light.auto !== false,
    devices: bag.light.devices.slice()
  };
}

async function yandex(token, method, pathname, body) {
  const response = await fetch("https://api.iot.yandex.net" + pathname, {
    method: method,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000)
  });
  const json = await response.json().catch(function () { return {}; });
  if (!response.ok) {
    const error = new Error(json.message || ("Яндекс ответил " + response.status));
    error.status = response.status >= 400 && response.status < 600 ? response.status : 502;
    throw error;
  }
  return json;
}

function hasColor(device) {
  return (device.capabilities || []).some(function (item) {
    return item.type === "devices.capabilities.color_setting" && item.parameters && item.parameters.color_model === "hsv";
  });
}

function isLamp(device) {
  const type = String(device && device.type || "");
  if (/speaker|socket|switch|relay|camera|media_device/.test(type)) return false;
  return hasColor(device);
}

function lampOn(device) {
  const cap = (device.capabilities || []).find(function (item) { return item.type === "devices.capabilities.on_off"; });
  return !!(cap && cap.state && cap.state.value === true);
}

function sceneList(device) {
  const color = (device.capabilities || []).find(function (item) { return item.type === "devices.capabilities.color_setting"; });
  const scenes = color && color.parameters && color.parameters.color_scene && color.parameters.color_scene.scenes;
  return Array.isArray(scenes) ? scenes : [];
}

async function listLights(token) {
  const info = await yandex(token, "GET", "/v1.0/user/info");
  return (info.devices || []).filter(isLamp).map(function (device) {
    return {
      id: device.id,
      name: device.name || "Лампа",
      on: lampOn(device),
      scenes: sceneList(device).map(function (scene) { return { id: String(scene.id || ""), name: String(scene.name || "") }; })
    };
  });
}

function hsvOk(body) {
  const h = Math.round(Number(body.h));
  const s = Math.round(Number(body.s));
  const v = Math.round(Number(body.v));
  if ([h, s, v].some(function (n) { return !Number.isFinite(n); })) return null;
  return { h: Math.min(360, Math.max(0, h)) % 360, s: Math.min(100, Math.max(1, s)), v: Math.min(100, Math.max(1, v)) };
}

function hsvActions(hsv) {
  return [
    { type: "devices.capabilities.on_off", state: { instance: "on", value: true } },
    { type: "devices.capabilities.color_setting", state: { instance: "hsv", value: hsv } },
    { type: "devices.capabilities.range", state: { instance: "brightness", value: hsv.v } }
  ];
}

async function paint(token, ids, hsv, effect) {
  const info = await yandex(token, "GET", "/v1.0/user/info");
  const byId = {};
  (info.devices || []).forEach(function (device) { if (isLamp(device)) byId[device.id] = device; });
  const wanted = sceneIds(effect);
  let usedScene = false;
  const devices = ids.filter(function (id) { return byId[id]; }).map(function (id) {
    const device = byId[id];
    const scenes = sceneList(device);
    const scene = wanted && scenes.find(function (item) { return wanted.indexOf(String(item.id)) >= 0; });
    if (scene) {
      usedScene = true;
      return {
        id: id,
        actions: [
          { type: "devices.capabilities.on_off", state: { instance: "on", value: true } },
          { type: "devices.capabilities.color_setting", state: { instance: "scene", value: scene.id } }
        ]
      };
    }
    return { id: id, actions: hsv ? hsvActions(hsv) : [] };
  }).filter(function (item) { return item.actions.length; });
  if (!devices.length) {
    const error = new Error("Нет выбранных ламп с цветом");
    error.status = 400;
    throw error;
  }
  try {
    return await yandex(token, "POST", "/v1.0/devices/actions", { devices: devices });
  } catch (err) {
    if (!usedScene || !hsv) throw err;
    return yandex(token, "POST", "/v1.0/devices/actions", {
      devices: devices.map(function (item) { return { id: item.id, actions: hsvActions(hsv) }; })
    });
  }
}

async function setPower(token, ids, on) {
  const devices = ids.map(function (id) {
    return {
      id: id,
      actions: [{ type: "devices.capabilities.on_off", state: { instance: "on", value: on } }]
    };
  });
  if (!devices.length) {
    const error = new Error("Нет выбранных ламп");
    error.status = 400;
    throw error;
  }
  return yandex(token, "POST", "/v1.0/devices/actions", { devices: devices });
}

function sceneIds(effect) {
  return FX_SCENE[effect] || null;
}

export function secretRoundTrip(password, text, reopen) {
  const sealed = seal(password, text);
  return openSecret(reopen || password, sealed.nonce, sealed.secret);
}

export async function handlePlugin(ctx) {
  const { req, res, room, tail, send, readJson, db, writeRoom } = ctx;
  try {
    const bag = pluginBag(room);
    const catalog = await pluginCatalog();
    if (req.method === "GET" && tail === "plugins") {
      const state = publicState(db, room, catalog);
      let lights = [];
      const token = readToken(db, room);
      if (token) {
        try { lights = await listLights(token); } catch (err) { state.lightError = err.message || "Нет связи с Яндексом"; }
      }
      state.lights = lights.map(function (item) { return { id: item.id, name: item.name, on: item.on === true }; });
      send(res, 200, state);
      return;
    }
    const body = req.method === "GET" ? {} : await readJson(req);
    const pluginId = String(body.id || "adaptive-light");
    if (!/^[a-z0-9-]{2,40}$/.test(pluginId)) {
      send(res, 400, { error: "неизвестный плагин" });
      return;
    }
    if (req.method === "POST" && tail === "plugins/install") {
      const item = catalog.find(function (row) { return row.id === pluginId; });
      if (!item) {
        send(res, 404, { error: "В списке нет такого плагина" });
        return;
      }
      if (!bag.installed.some(function (row) { return row.id === item.id; })) {
        bag.installed.push({ id: item.id, name: item.name, on: false });
      }
      writeRoom(room);
      send(res, 200, publicState(db, room, catalog));
      return;
    }
    if (req.method === "POST" && tail === "plugins/remove") {
      bag.installed = bag.installed.filter(function (row) { return row.id !== pluginId; });
      writeRoom(room);
      send(res, 200, publicState(db, room, catalog));
      return;
    }
    const row = bag.installed.find(function (item) { return item.id === pluginId; });
    if (!row && tail !== "plugins/install") {
      send(res, 404, { error: "Плагин не добавлен" });
      return;
    }
    if (req.method === "POST" && tail === "plugins/enable") {
      if (!passwordOk(room, body.password)) {
        send(res, 403, { error: "Неверный пароль комнаты" });
        return;
      }
      row.on = true;
      writeRoom(room);
      send(res, 200, publicState(db, room, catalog));
      return;
    }
    if (req.method === "POST" && tail === "plugins/disable") {
      row.on = false;
      writeRoom(room);
      send(res, 200, publicState(db, room, catalog));
      return;
    }
    if (req.method === "POST" && tail === "plugins/key") {
      if (!passwordOk(room, body.password)) {
        send(res, 403, { error: "Неверный пароль комнаты" });
        return;
      }
      const token = String(body.token || "").trim();
      if (token.length < 8 || token.length > 400) {
        send(res, 400, { error: "Ключ не похож на токен" });
        return;
      }
      if (!room.masterKey) {
        send(res, 400, { error: "Сначала войдите в комнату ещё раз" });
        return;
      }
      const sealed = seal(room.masterKey, token);
      db.prepare(`
        INSERT INTO room_secrets (room_id, plugin_id, nonce, secret)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(room_id, plugin_id) DO UPDATE SET nonce = excluded.nonce, secret = excluded.secret
      `).run(room.id, pluginId, sealed.nonce, sealed.secret);
      send(res, 200, { ok: true, hasKey: true });
      return;
    }
    if (req.method === "POST" && tail === "plugins/devices") {
      const ids = Array.isArray(body.ids) ? body.ids.map(function (id) { return String(id || "").slice(0, 80); }).filter(Boolean).slice(0, 40) : [];
      bag.light.devices = ids;
      writeRoom(room);
      send(res, 200, { devices: ids });
      return;
    }
    if (req.method === "POST" && tail === "plugins/auto") {
      bag.light.auto = body.on !== false;
      writeRoom(room);
      send(res, 200, { auto: bag.light.auto });
      return;
    }
    if (req.method === "POST" && tail === "plugins/power") {
      const token = readToken(db, room);
      if (!token) {
        send(res, 409, { error: "Ключ не задан" });
        return;
      }
      const ids = Array.isArray(body.ids) && body.ids.length
        ? body.ids.map(function (id) { return String(id || "").slice(0, 80); }).filter(Boolean).slice(0, 40)
        : bag.light.devices.slice();
      await setPower(token, ids, body.on !== false);
      send(res, 200, { ok: true, on: body.on !== false });
      return;
    }
    if (req.method === "POST" && tail === "plugins/apply") {
      if (!row.on) {
        send(res, 200, { skipped: true });
        return;
      }
      if (body.manual !== true && bag.light.auto === false) {
        send(res, 200, { skipped: true });
        return;
      }
      const token = readToken(db, room);
      if (!token) {
        send(res, 409, { error: "Ключ не задан" });
        return;
      }
      const hsv = hsvOk(body);
      const effect = FX_SCENE[body.effect] ? body.effect : "";
      if (!hsv && !effect) {
        send(res, 400, { error: "Нет цвета" });
        return;
      }
      await paint(token, bag.light.devices, hsv, effect);
      send(res, 200, { ok: true });
      return;
    }
    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, err.status || 502, { error: err.message || "Плагин не ответил" });
  }
}
