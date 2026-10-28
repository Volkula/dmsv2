import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export function openDb(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "files"), { recursive: true });
  const db = new DatabaseSync(path.join(dir, "shirmo.sqlite"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      master_salt TEXT NOT NULL,
      master_hash TEXT NOT NULL,
      publish_mode TEXT NOT NULL DEFAULT 'live',
      campaign TEXT NOT NULL,
      frame TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  const names = db.prepare("PRAGMA table_info(rooms)").all().map(function (column) { return column.name; });
  if (names.indexOf("roll_log") < 0) db.exec("ALTER TABLE rooms ADD COLUMN roll_log TEXT NOT NULL DEFAULT '[]'");
  if (names.indexOf("roll_pins") < 0) db.exec("ALTER TABLE rooms ADD COLUMN roll_pins TEXT NOT NULL DEFAULT '[]'");
  if (names.indexOf("master_key") < 0) db.exec("ALTER TABLE rooms ADD COLUMN master_key TEXT NOT NULL DEFAULT ''");
  if (names.indexOf("deleted_at") < 0) db.exec("ALTER TABLE rooms ADD COLUMN deleted_at INTEGER NOT NULL DEFAULT 0");
  db.exec(`
    CREATE TABLE IF NOT EXISTS room_secrets (
      room_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      nonce TEXT NOT NULL,
      secret TEXT NOT NULL,
      PRIMARY KEY (room_id, plugin_id)
    )
  `);
  return db;
}

function list(text) {
  try {
    const value = JSON.parse(text || "[]");
    return Array.isArray(value) ? value : [];
  } catch (err) {
    return [];
  }
}

export function rowToRoom(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    masterSalt: row.master_salt,
    masterHash: row.master_hash,
    masterKey: row.master_key || "",
    publishMode: row.publish_mode,
    campaign: JSON.parse(row.campaign),
    frame: JSON.parse(row.frame),
    rolls: list(row.roll_log),
    pins: list(row.roll_pins),
    updatedAt: row.updated_at
  };
}
