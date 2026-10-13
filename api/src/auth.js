import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function newSecret() {
  return randomBytes(24).toString("base64url");
}

export function hashSecret(secret, salt) {
  const used = salt || randomBytes(16).toString("hex");
  const hash = scryptSync(secret, used, 32).toString("hex");
  return { salt: used, hash };
}

export function secretMatches(secret, salt, hash) {
  if (!secret || !salt || !hash) return false;
  const check = hashSecret(secret, salt).hash;
  const a = Buffer.from(check, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function bearer(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export function plainMatches(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (!a.length || !b.length) return false;
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function isAdmin(req) {
  const want = process.env.ADMIN_PASSWORD || "";
  if (!want) return false;
  return plainMatches(bearer(req), want);
}
