import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ROOM_FILES_MAX, roomFilesSize } from "./files.js";

const MAX_IMAGE = 8_000_000;

function privateHost(host) {
  const name = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!name || name === "localhost" || name.endsWith(".localhost") || name.endsWith(".local") || name.endsWith(".internal")) return true;
  if (name === "0.0.0.0" || name === "::1" || name === "::") return true;
  const parts = name.split(".");
  if (parts.length !== 4 || parts.some(function (part) { return !/^\d+$/.test(part); })) return false;
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function sniff(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "";
}

function walkPortraits(node, out) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach(function (item) { walkPortraits(item, out); });
    return;
  }
  if (typeof node.portrait === "string") out.push(node);
  Object.keys(node).forEach(function (key) {
    const child = node[key];
    if (child && typeof child === "object") walkPortraits(child, out);
  });
}

function mapPath(filesDir, roomId) {
  return path.join(filesDir, "..", "remote-maps", roomId + ".json");
}

function readMap(filesDir, roomId) {
  try {
    const parsed = JSON.parse(fs.readFileSync(mapPath(filesDir, roomId), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

function writeMap(filesDir, roomId, known) {
  const file = mapPath(filesDir, roomId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(known));
}

async function pullImage(filesDir, roomId, url) {
  let parsed;
  try { parsed = new URL(url); } catch (err) { return null; }
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || privateHost(parsed.hostname)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, 12000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": "shirmo" }
    });
    if (!res.ok || !res.body) return null;
    let finalHost = "";
    try { finalHost = new URL(res.url).hostname; } catch (err) { return null; }
    if (privateHost(finalHost)) return null;
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const step = await reader.read();
      if (step.done) break;
      size += step.value.byteLength;
      if (size > MAX_IMAGE) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(step.value));
    }
    const buf = Buffer.concat(chunks);
    const type = sniff(buf);
    if (!type || buf.length < 32) return null;
    if (roomFilesSize(filesDir, roomId) + buf.length > ROOM_FILES_MAX) return null;
    const id = randomUUID();
    const dir = path.join(filesDir, roomId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, id), buf);
    fs.writeFileSync(path.join(dir, id + ".type"), type);
    return id;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function pool(items, limit, fn) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await fn(items[index]);
    }
  }
  const width = Math.min(limit, items.length);
  const jobs = [];
  for (let i = 0; i < width; i += 1) jobs.push(worker());
  await Promise.all(jobs);
}

export async function absorbPortraits(filesDir, roomId, campaign) {
  const nodes = [];
  walkPortraits(campaign, nodes);
  const urls = [];
  nodes.forEach(function (node) {
    const url = String(node.portrait || "").trim();
    if (/^https?:\/\//i.test(url) && urls.indexOf(url) < 0) urls.push(url);
  });
  if (!urls.length) return {};
  const known = readMap(filesDir, roomId);
  const local = {};
  await pool(urls, 4, async function (url) {
    const hit = known[url];
    if (hit && /^[\w-]+$/.test(hit) && fs.existsSync(path.join(filesDir, roomId, hit))) {
      local[url] = "/api/rooms/" + roomId + "/files/" + hit;
      return;
    }
    const id = await pullImage(filesDir, roomId, url);
    if (!id) return;
    known[url] = id;
    local[url] = "/api/rooms/" + roomId + "/files/" + id;
  });
  if (!Object.keys(local).length) return {};
  nodes.forEach(function (node) {
    const url = String(node.portrait || "").trim();
    if (local[url]) node.portrait = local[url];
  });
  writeMap(filesDir, roomId, known);
  return local;
}
