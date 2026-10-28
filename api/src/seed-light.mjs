import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { pluginCatalog } from "./plugins.js";
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";

const roomId = String(process.argv[2] || "");
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const token = Buffer.concat(chunks).toString("utf8").trim();
if (!roomId || token.length < 8) {
  console.error("нужны id комнаты и ключ в stdin");
  process.exit(1);
}

function seal(masterKey, text) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(String(masterKey), "shirmo-light-v1", 32), iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return { nonce: Buffer.concat([iv, cipher.getAuthTag()]).toString("base64url"), secret: enc.toString("base64url") };
}

const db = new DatabaseSync(path.join(process.env.DATA_DIR || "/data", "shirmo.sqlite"));
db.exec(`
  CREATE TABLE IF NOT EXISTS room_secrets (
    room_id TEXT NOT NULL,
    plugin_id TEXT NOT NULL,
    nonce TEXT NOT NULL,
    secret TEXT NOT NULL,
    PRIMARY KEY (room_id, plugin_id)
  )
`);
const row = db.prepare("SELECT master_key, campaign FROM rooms WHERE id = ?").get(roomId);
if (!row || !row.master_key) {
  console.error("комната не найдена или нет ключа мастера");
  process.exit(1);
}
const sealed = seal(row.master_key, token);
db.prepare(`
  INSERT INTO room_secrets (room_id, plugin_id, nonce, secret)
  VALUES (?, 'adaptive-light', ?, ?)
  ON CONFLICT(room_id, plugin_id) DO UPDATE SET nonce = excluded.nonce, secret = excluded.secret
`).run(roomId, sealed.nonce, sealed.secret);

const info = await fetch("https://api.iot.yandex.net/v1.0/user/info", {
  headers: { Authorization: "Bearer " + token }
});
const body = await info.json().catch(function () { return {}; });
if (!info.ok) {
  console.error(body.message || ("Яндекс ответил " + info.status));
  process.exit(1);
}
const lamps = (body.devices || []).filter(function (device) {
  const type = String(device.type || "");
  if (/speaker|socket|switch|relay|camera|media_device/.test(type)) return false;
  return (device.capabilities || []).some(function (item) {
    return item.type === "devices.capabilities.color_setting" && item.parameters && item.parameters.color_model === "hsv";
  });
});
const catalog = await pluginCatalog();
const known = catalog.find(function (item) { return item.id === "adaptive-light"; }) || { id: "adaptive-light", name: "" };
const campaign = JSON.parse(row.campaign || "{}");
if (!campaign.plugins || typeof campaign.plugins !== "object" || Array.isArray(campaign.plugins)) campaign.plugins = {};
campaign.plugins.installed = (campaign.plugins.installed || []).filter(function (item) { return item && item.id !== "adaptive-light"; });
campaign.plugins.installed.push({ id: known.id, name: known.name, on: true });
campaign.plugins.light = { auto: true, devices: lamps.map(function (device) { return device.id; }) };
delete campaign.plugins.token;
delete campaign.plugins.key;
db.prepare("UPDATE rooms SET campaign = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(campaign), Date.now(), roomId);
console.log("stored");
lamps.forEach(function (device) { console.log(device.name + " | " + device.type); });
if (!lamps.length) console.log("цветных ламп нет");
