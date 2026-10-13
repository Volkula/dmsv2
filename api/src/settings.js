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
    const value = Object.assign({}, DEFAULTS, next || {});
    value.publicCreate = value.publicCreate !== false;
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
    return value;
  }

  if (!fs.existsSync(file)) write(DEFAULTS);
  return { read: read, write: write, file: file };
}
