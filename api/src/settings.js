import fs from "node:fs";
import path from "node:path";

const DEFAULTS = { publicCreate: true };

export function openSettings(dataDir) {
  const file = path.join(dataDir, "settings.json");

  function read() {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      return Object.assign({}, DEFAULTS, raw && typeof raw === "object" ? raw : {});
    } catch (err) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function write(next) {
    const prev = read();
    const value = Object.assign({}, DEFAULTS, prev, next || {});
    if (Object.prototype.hasOwnProperty.call(next || {}, "publicCreate")) {
      value.publicCreate = next.publicCreate === true || next.publicCreate === "on" || next.publicCreate === 1 || next.publicCreate === "1";
    } else {
      value.publicCreate = value.publicCreate !== false;
    }
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
    return value;
  }

  if (!fs.existsSync(file)) write(DEFAULTS);
  return { read: read, write: write, file: file };
}
