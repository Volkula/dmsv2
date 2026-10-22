import fs from "node:fs";
import path from "node:path";

export const ROOM_FILES_MAX = Math.max(1, Number(process.env.ROOM_FILES_MAX) || 1_073_741_824);

export function roomDir(filesDir, roomId) {
  return path.join(filesDir, roomId);
}

export function roomFilesSize(filesDir, roomId) {
  const dir = roomDir(filesDir, roomId);
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  fs.readdirSync(dir).forEach(function (name) {
    if (name.endsWith(".type")) return;
    try {
      total += fs.statSync(path.join(dir, name)).size;
    } catch (err) { /* skip */ }
  });
  return total;
}

export function listRoomFileNames(filesDir, roomId) {
  const dir = roomDir(filesDir, roomId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(function (name) {
    return !name.endsWith(".type");
  });
}

export function packFiles(filesDir, roomId) {
  return listRoomFileNames(filesDir, roomId).map(function (name) {
    let type = "application/octet-stream";
    try {
      type = fs.readFileSync(path.join(roomDir(filesDir, roomId), name + ".type"), "utf8").trim() || type;
    } catch (err) { /* нет типа */ }
    return {
      id: name,
      type: type.slice(0, 80),
      data: fs.readFileSync(path.join(roomDir(filesDir, roomId), name)).toString("base64")
    };
  });
}

function fileType(dir, name) {
  let type = "application/octet-stream";
  try {
    type = fs.readFileSync(path.join(dir, name + ".type"), "utf8").trim() || type;
  } catch (err) { /* нет типа */ }
  return type.slice(0, 80);
}

/** Пишет массив files в открытый fd по одному файлу — без удержания всей выгрузки в RAM. */
export function writePackedFiles(fd, filesDir, roomId) {
  const dir = roomDir(filesDir, roomId);
  const names = listRoomFileNames(filesDir, roomId);
  fs.writeSync(fd, "[");
  names.forEach(function (name, index) {
    if (index) fs.writeSync(fd, ",");
    const data = fs.readFileSync(path.join(dir, name)).toString("base64");
    fs.writeSync(fd, JSON.stringify({ id: name, type: fileType(dir, name), data: data }));
  });
  fs.writeSync(fd, "]");
}

/** То же в HTTP/stream: write(chunk) → Promise, с backpressure. */
export async function pipePackedFiles(write, filesDir, roomId) {
  const dir = roomDir(filesDir, roomId);
  const names = listRoomFileNames(filesDir, roomId);
  await write("[");
  for (let index = 0; index < names.length; index += 1) {
    if (index) await write(",");
    const name = names[index];
    const data = fs.readFileSync(path.join(dir, name)).toString("base64");
    await write(JSON.stringify({ id: name, type: fileType(dir, name), data: data }));
  }
  await write("]");
}

export function unpackFiles(filesDir, roomId, files, maxBytes) {
  const limit = maxBytes || ROOM_FILES_MAX;
  const dir = roomDir(filesDir, roomId);
  fs.mkdirSync(dir, { recursive: true });
  let used = roomFilesSize(filesDir, roomId);
  (Array.isArray(files) ? files : []).forEach(function (file) {
    const fileId = String(file && file.id || "").replace(/[^\w-]/g, "");
    if (!fileId || !file.data) return;
    const buf = Buffer.from(String(file.data), "base64");
    if (!buf.length) return;
    if (used + buf.length > limit) {
      const err = new Error("лимит файлов комнаты: " + limit + " байт");
      err.status = 413;
      throw err;
    }
    fs.writeFileSync(path.join(dir, fileId), buf);
    fs.writeFileSync(path.join(dir, fileId + ".type"), String(file.type || "application/octet-stream").slice(0, 80));
    used += buf.length;
  });
}

export function wipeRoomFiles(filesDir, roomId) {
  fs.rmSync(roomDir(filesDir, roomId), { recursive: true, force: true });
}
