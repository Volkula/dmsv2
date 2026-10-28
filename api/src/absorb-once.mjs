import path from "node:path";
import { openDb, rowToRoom } from "./db.js";
import { projectFrame } from "./frame.js";
import { absorbPortraits } from "./portraits.js";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const roomId = process.argv[2];
if (!roomId) {
  console.error("room id required");
  process.exit(1);
}
const db = openDb(dataDir);
const row = db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId);
const room = rowToRoom(row);
if (!room) {
  console.error("room missing");
  process.exit(1);
}
const files = await absorbPortraits(path.join(dataDir, "files"), roomId, room.campaign);
const frame = projectFrame(room.campaign);
db.prepare("UPDATE rooms SET campaign = ?, frame = ?, updated_at = ? WHERE id = ?").run(
  JSON.stringify(room.campaign),
  JSON.stringify(frame),
  Date.now(),
  roomId
);
console.log("localized " + Object.keys(files).length);
