import assert from "node:assert/strict";
import fs from "node:fs";
import { secretRoundTrip, pluginCatalog } from "./plugins.js";

assert.equal(secretRoundTrip("room-password", "token-value-not-logged"), "token-value-not-logged");
assert.throws(function () { secretRoundTrip("room-password", "token-value-not-logged", "other"); });

const catalog = await pluginCatalog();
const bundled = JSON.parse(fs.readFileSync(new URL("./bundled/adaptive-light.json", import.meta.url), "utf8"));
assert.ok(catalog.some(function (item) { return item.id === bundled.id && item.name === bundled.name; }));
const lightShow = catalog.find(function (item) { return item.id === "light-show"; });
assert.equal(lightShow && lightShow.name, "Свет");
assert.match(lightShow.src, /shirmo-light-show\/releases\/latest\/download\/plugin\.js$/);
const melk = catalog.find(function (item) { return item.id === "melk-lamps"; });
assert.equal(melk && melk.name, "Лампы MELK");
assert.match(melk.src, /shirmo-melk\/releases\/latest\/download\/plugin\.js$/);
const clock = catalog.find(function (item) { return item.id === "clock"; });
assert.equal(clock && clock.name, "Часы");
assert.match(clock.src, /shirmo-clock\/releases\/latest\/download\/plugin\.js$/);
const timer = catalog.find(function (item) { return item.id === "timer"; });
assert.equal(timer && timer.name, "Таймер");
assert.match(timer.src, /shirmo-timer\/releases\/latest\/download\/plugin\.js$/);
console.log("plugins ok");
