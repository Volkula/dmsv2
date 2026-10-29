import assert from "node:assert/strict";
import fs from "node:fs";
import { secretRoundTrip, pluginCatalog } from "./plugins.js";

assert.equal(secretRoundTrip("room-password", "token-value-not-logged"), "token-value-not-logged");
assert.throws(function () { secretRoundTrip("room-password", "token-value-not-logged", "other"); });

const catalog = await pluginCatalog();
const bundled = JSON.parse(fs.readFileSync(new URL("./bundled/adaptive-light.json", import.meta.url), "utf8"));
assert.ok(catalog.some(function (item) { return item.id === bundled.id && item.name === bundled.name; }));
const melk = JSON.parse(fs.readFileSync(new URL("./bundled/melk-lamps.json", import.meta.url), "utf8"));
assert.ok(catalog.some(function (item) { return item.id === melk.id && item.name === melk.name && item.src === ""; }));
console.log("plugins ok");
