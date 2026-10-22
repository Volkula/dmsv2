#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { openDb, rowToRoom } from "./db.js";
import { hashSecret, newSecret } from "./auth.js";
import { campaignOk, projectFrame } from "./frame.js";
import { unpackFiles, wipeRoomFiles, writePackedFiles, ROOM_FILES_MAX } from "./files.js";
import { openSettings } from "./settings.js";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const backupRoot = process.env.BACKUP_DIR || "/backups";
const db = openDb(dataDir);
const filesDir = path.join(dataDir, "files");
const settings = openSettings(dataDir);

const selectRoom = db.prepare("SELECT * FROM rooms WHERE id = ?");
const listRooms = db.prepare("SELECT id, title, master_key, updated_at, deleted_at FROM rooms ORDER BY updated_at DESC");
const insertRoom = db.prepare(`
  INSERT INTO rooms (id, title, master_salt, master_hash, master_key, publish_mode, campaign, frame, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const saveAuth = db.prepare("UPDATE rooms SET master_salt = ?, master_hash = ?, master_key = ?, updated_at = ? WHERE id = ?");
const saveRolls = db.prepare("UPDATE rooms SET roll_log = ? WHERE id = ?");
const savePins = db.prepare("UPDATE rooms SET roll_pins = ? WHERE id = ?");
const purgeRoom = db.prepare("DELETE FROM rooms WHERE id = ?");
const trashList = db.prepare("SELECT id FROM rooms WHERE deleted_at > 0");

function stamp() {
  const d = new Date();
  const p = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

function writeRoomPack(row, filePath) {
  const room = rowToRoom(row);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const fd = fs.openSync(filePath, "w");
  try {
    fs.writeSync(fd, '{"roomId":' + JSON.stringify(room.id));
    fs.writeSync(fd, ',"title":' + JSON.stringify(room.title));
    fs.writeSync(fd, ',"campaign":' + JSON.stringify(room.campaign));
    fs.writeSync(fd, ',"rolls":' + JSON.stringify(room.rolls));
    fs.writeSync(fd, ',"pins":' + JSON.stringify(room.pins));
    fs.writeSync(fd, ',"files":');
    writePackedFiles(fd, filesDir, room.id);
    fs.writeSync(fd, ',"deletedAt":' + Number(row.deleted_at || 0) + "}");
  } finally {
    fs.closeSync(fd);
  }
}

function setPassword(id, password) {
  const hashed = hashSecret(password);
  saveAuth.run(hashed.salt, hashed.hash, password, Date.now(), id);
}

function cmdList() {
  listRooms.all().forEach(function (row) {
    const mark = row.deleted_at ? " [корзина]" : "";
    console.log(row.id + "\t" + (row.title || "Комната") + mark);
  });
}

function cmdResetRoom(id) {
  if (!id) throw new Error("нужен id комнаты");
  const row = selectRoom.get(id);
  if (!row) throw new Error("комната не найдена: " + id);
  const password = newSecret().slice(0, 16);
  setPassword(id, password);
  console.log("Комната: " + id);
  console.log("Название: " + row.title);
  console.log("Новый пароль: " + password);
}

function cmdResetAll() {
  const rows = listRooms.all();
  rows.forEach(function (row) {
    const password = newSecret().slice(0, 16);
    setPassword(row.id, password);
    console.log(row.id + "\t" + (row.title || "") + "\t" + password);
  });
  console.log("Сброшено комнат: " + rows.length);
}

function cmdPurgeTrash() {
  const rows = trashList.all();
  rows.forEach(function (row) {
    purgeRoom.run(row.id);
    wipeRoomFiles(filesDir, row.id);
    console.log("удалено " + row.id);
  });
  console.log("Очищено из корзины: " + rows.length);
}

function cmdBackupAll(outDir) {
  const dir = outDir || path.join(backupRoot, "full-" + stamp());
  fs.mkdirSync(dir, { recursive: true });
  const index = [];
  listRooms.all().forEach(function (row) {
    const name = row.id + ".shirmo.json";
    writeRoomPack(row, path.join(dir, name));
    index.push({ id: row.id, title: row.title, file: name, deletedAt: row.deleted_at || 0 });
  });
  fs.copyFileSync(path.join(dataDir, "shirmo.sqlite"), path.join(dir, "shirmo.sqlite"));
  try { fs.copyFileSync(settings.file, path.join(dir, "settings.json")); } catch (err) { /* нет */ }
  fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify({ at: Date.now(), rooms: index }, null, 2));
  console.log(dir);
}

function cmdBackupRoom(id, outFile) {
  if (!id) throw new Error("нужен id комнаты");
  const row = selectRoom.get(id);
  if (!row) throw new Error("комната не найдена: " + id);
  const file = outFile || path.join(backupRoot, "room-" + id.slice(0, 8) + "-" + stamp() + ".shirmo.json");
  writeRoomPack(row, file);
  console.log(file);
  console.log("пароль мастера (текущий): " + (row.master_key || "(не сохранён)"));
}

function cmdRestoreRoom(file, password) {
  if (!file) throw new Error("нужен путь к .shirmo.json");
  const pack = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!pack.campaign || !campaignOk(pack.campaign)) throw new Error("bad campaign");
  const key = String(password || newSecret().slice(0, 16));
  if (key.length < 4) throw new Error("пароль слишком короткий");
  const roomId = randomUUID();
  const hashed = hashSecret(key);
  const title = String(pack.title || "Восстановление").slice(0, 80);
  const fromId = String(pack.roomId || pack.id || "").replace(/[^\w-]/g, "");
  let campaign = pack.campaign;
  if (fromId && fromId !== roomId) {
    campaign = JSON.parse(JSON.stringify(campaign).split("/api/rooms/" + fromId + "/").join("/api/rooms/" + roomId + "/"));
  }
  const frame = projectFrame(campaign);
  const now = Date.now();
  insertRoom.run(roomId, title, hashed.salt, hashed.hash, key, "live", JSON.stringify(campaign), JSON.stringify(frame), now);
  unpackFiles(filesDir, roomId, pack.files, ROOM_FILES_MAX);
  if (Array.isArray(pack.rolls)) saveRolls.run(JSON.stringify(pack.rolls.slice(0, 40)), roomId);
  if (Array.isArray(pack.pins)) savePins.run(JSON.stringify(pack.pins.slice(0, 40)), roomId);
  console.log("Комната: " + roomId);
  console.log("Название: " + title);
  console.log("Пароль: " + key);
}

function usage() {
  console.log("cli.js <команда>");
  console.log("  list-rooms");
  console.log("  reset-room-password <id>");
  console.log("  reset-all-passwords");
  console.log("  purge-trash");
  console.log("  backup-all [dir]");
  console.log("  backup-room <id> [file]");
  console.log("  restore-room <file> [password]");
  console.log("  public-create [on|off]");
  console.log("DATA_DIR=" + dataDir);
  console.log("BACKUP_DIR=" + backupRoot);
  console.log("ROOM_FILES_MAX=" + ROOM_FILES_MAX);
}

const [cmd, a, b] = process.argv.slice(2);
try {
  if (cmd === "list-rooms") cmdList();
  else if (cmd === "reset-room-password") cmdResetRoom(a);
  else if (cmd === "reset-all-passwords") cmdResetAll();
  else if (cmd === "purge-trash") cmdPurgeTrash();
  else if (cmd === "backup-all") cmdBackupAll(a);
  else if (cmd === "backup-room") cmdBackupRoom(a, b);
  else if (cmd === "restore-room") cmdRestoreRoom(a, b);
  else if (cmd === "public-create") {
    const on = a !== "off" && a !== "0" && a !== "false";
    const value = settings.write({ publicCreate: on });
    console.log("publicCreate=" + value.publicCreate);
  } else {
    usage();
    process.exit(cmd ? 1 : 0);
  }
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
