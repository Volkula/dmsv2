import assert from "node:assert/strict";
import fs from "node:fs";
import { secretRoundTrip, pluginCatalog } from "./plugins.js";

assert.equal(secretRoundTrip("room-password", "token-value-not-logged"), "token-value-not-logged");
assert.throws(function () { secretRoundTrip("room-password", "token-value-not-logged", "other"); });

const catalog = await pluginCatalog();
const bundled = JSON.parse(fs.readFileSync(new URL("./bundled/adaptive-light.json", import.meta.url), "utf8"));
assert.ok(catalog.some(function (item) { return item.id === bundled.id && item.name === bundled.name; }));
const melk = catalog.find(function (item) { return item.id === "melk-lamps"; });
assert.equal(melk && melk.name, "Лампы MELK");
assert.match(melk.src, /shirmo-melk\/releases\/latest\/download\/plugin\.js$/);
console.log("plugins ok");
