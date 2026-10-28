(function () {
  const FX = {
    sand: { h: 32, s: 72, v: 78 },
    magic: { h: 42, s: 48, v: 92 },
    smoke: { h: 220, s: 10, v: 42 },
    blizzard: { h: 204, s: 38, v: 88 },
    fire: { h: 14, s: 92, v: 100 },
    flood: { h: 208, s: 78, v: 72 }
  };
  const FOE = "#e23b2f";
  const BACK = "#16130f";
  let opt = null;
  let enabled = false;
  let auto = true;
  let effect = "";
  let actor = null;
  let placeLoc = null;
  let placeImage = "";
  let lastKey = "";
  let wait = 0;
  const tones = {};

  function lampHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return {
      h: Math.round(h) % 360,
      s: Math.min(100, Math.max(1, Math.round((max ? d / max : 0) * 100))),
      v: Math.min(100, Math.max(1, Math.round(max * 100)))
    };
  }

  function hexHsv(hex) {
    const text = String(hex || "").trim();
    const match = /^#?([0-9a-f]{6})$/i.exec(text);
    if (!match) return null;
    const n = parseInt(match[1], 16);
    return lampHsv((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }

  function fightOn() {
    try { return !!(opt && opt.fightOn && opt.fightOn()); }
    catch (err) { return false; }
  }

  function post(path, body) {
    return fetch("/api/rooms/" + opt.roomId + "/plugins" + path, {
      method: path ? "POST" : "GET",
      headers: opt.headers,
      body: path ? JSON.stringify(body || {}) : undefined
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (json) {
        if (!response.ok) throw new Error(json.error || "Плагин не ответил");
        return json;
      });
    });
  }

  function refresh() {
    if (!opt) return Promise.resolve(null);
    return post("", null).then(function (state) {
      const row = (state.installed || []).find(function (item) { return item.id === "adaptive-light"; });
      enabled = !!(row && row.on);
      auto = state.auto !== false;
      return state;
    }).catch(function () { return null; });
  }

  function send(body, manual) {
    if (!opt || !enabled) return;
    if (!manual && !auto) return;
    const key = JSON.stringify(body);
    if (key === lastKey) return;
    lastKey = key;
    post("/apply", body).catch(function () { lastKey = ""; });
  }

  function queue(body, manual) {
    clearTimeout(wait);
    if (manual) {
      send(Object.assign({ manual: true }, body), true);
      return;
    }
    wait = setTimeout(function () { send(body, false); }, 350);
  }

  function turnColor(row) {
    if (!row) return "";
    if (row.side !== "player") return FOE;
    if (/^#[0-9a-f]{6}$/i.test(row.color || "")) return row.color;
    const battle = opt && opt.campaign && opt.campaign().battle;
    return (battle && battle.player) || "#7dcea0";
  }

  function placeColor(loc) {
    if (!loc) return "";
    if (/^#[0-9a-f]{6}$/i.test(loc.lampColor || "")) return loc.lampColor;
    if (tones[loc.id]) return tones[loc.id];
    if (!placeImage) return BACK;
    return "";
  }

  function paintSwatch(loc, color) {
    if (!loc || !color) return;
    document.querySelectorAll('[data-lamp="' + loc.id + '"]').forEach(function (node) {
      if (loc.lampColor) return;
      node.style.setProperty("--swatch", color);
    });
  }

  function sample(url, loc) {
    if (!url || !loc) return;
    const image = new Image();
    image.onload = function () {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 96;
        canvas.height = 54;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, 96, 54);
        const data = ctx.getImageData(0, 0, 96, 54).data;
        const bins = {};
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          const key = (data[i] >> 4) + "," + (data[i + 1] >> 4) + "," + (data[i + 2] >> 4);
          const bin = bins[key] || (bins[key] = { n: 0, r: 0, g: 0, b: 0 });
          bin.n += 1;
          bin.r += data[i];
          bin.g += data[i + 1];
          bin.b += data[i + 2];
        }
        let best = null;
        Object.keys(bins).forEach(function (key) { if (!best || bins[key].n > best.n) best = bins[key]; });
        if (!best) return;
        const r = Math.round(best.r / best.n);
        const g = Math.round(best.g / best.n);
        const b = Math.round(best.b / best.n);
        const hex = "#" + [r, g, b].map(function (n) { return n.toString(16).padStart(2, "0"); }).join("");
        tones[loc.id] = hex;
        paintSwatch(loc, hex);
        if (placeLoc && placeLoc.id === loc.id) apply();
      } catch (err) { /* картинка с чужого домена не красится, лампа остаётся на своём цвете */ }
    };
    image.src = url;
  }

  function apply() {
    try {
      if (!enabled || !auto) return;
      if (effect && FX[effect]) {
        queue(Object.assign({ effect: effect }, FX[effect]), false);
        return;
      }
      if (fightOn() && actor) {
        const hsv = hexHsv(turnColor(actor));
        if (hsv) queue(hsv, false);
        return;
      }
      if (placeLoc && placeLoc.lamp === true) {
        const hsv = hexHsv(placeColor(placeLoc));
        if (hsv) queue(hsv, false);
      }
    } catch (err) { /* смена цвета не должна ронять ширму */ }
  }

  function closeCard() {
    const old = document.getElementById("plugin-card");
    if (old) old.remove();
  }

  function field(label, type) {
    const wrap = document.createElement("label");
    wrap.className = "plugin-field";
    wrap.append(document.createTextNode(label));
    const input = document.createElement("input");
    input.type = type;
    input.autocomplete = "off";
    wrap.append(input);
    return { wrap: wrap, input: input };
  }

  function draw(host, state) {
    host.innerHTML = "";
    const installed = state.installed || [];
    if (!installed.length) {
      const empty = document.createElement("p");
      empty.className = "note";
      empty.textContent = "Плагинов нет.";
      host.append(empty);
    }
    installed.forEach(function (row) {
      const line = document.createElement("div");
      line.className = "plugin-line";
      const name = document.createElement("b");
      name.textContent = row.name || row.id;
      line.append(name);
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.textContent = row.on ? "Выключить" : "Включить";
      toggle.addEventListener("click", function () {
        if (row.on) {
          post("/disable", { id: row.id }).then(function () { return refresh(); }).then(function (next) {
            enabled = false;
            if (next) draw(host, next);
          }).catch(function (error) { note(host, error.message); });
          return;
        }
        askEnable(host, state, row);
      });
      const drop = document.createElement("button");
      drop.type = "button";
      drop.textContent = "Убрать";
      drop.addEventListener("click", function () {
        post("/remove", { id: row.id }).then(refresh).then(function (next) { if (next) draw(host, next); }).catch(function (error) { note(host, error.message); });
      });
      line.append(toggle, drop);
      host.append(line);
      if (row.on) devices(host, state);
    });
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "Добавить";
    add.addEventListener("click", function () { catalog(host, state); });
    host.append(add);
  }

  function note(host, text) {
    let row = host.querySelector(".plugin-note");
    if (!row) {
      row = document.createElement("p");
      row.className = "note plugin-note";
      host.append(row);
    }
    row.textContent = text || "";
  }

  function catalog(host, state) {
    const have = {};
    (state.installed || []).forEach(function (row) { have[row.id] = true; });
    const list = (state.catalog || []).filter(function (row) { return row && row.name && !have[row.id]; });
    const box = document.createElement("div");
    box.className = "plugin-catalog";
    if (!list.length) {
      const empty = document.createElement("p");
      empty.className = "note";
      empty.textContent = "Список пуст.";
      box.append(empty);
    }
    list.forEach(function (row) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = row.name;
      button.addEventListener("click", function () {
        post("/install", { id: row.id }).then(refresh).then(function (next) { if (next) draw(host, next); }).catch(function (error) { note(host, error.message); });
      });
      box.append(button);
    });
    host.append(box);
  }

  function askEnable(host, state, row) {
    const box = document.createElement("form");
    box.className = "plugin-form";
    const pass = field("Пароль комнаты", "password");
    box.append(pass.wrap);
    let token = null;
    if (!state.hasKey) {
      token = field("Ключ Яндекса", "password");
      box.append(token.wrap);
    }
    const go = document.createElement("button");
    go.type = "submit";
    go.textContent = "Включить";
    box.append(go);
    box.addEventListener("submit", function (event) {
      event.preventDefault();
      const password = pass.input.value;
      const key = token ? token.input.value.trim() : "";
      pass.input.value = "";
      if (token) token.input.value = "";
      const steps = key ? post("/key", { id: row.id, password: password, token: key }) : Promise.resolve();
      steps.then(function () { return post("/enable", { id: row.id, password: password }); })
        .then(refresh)
        .then(function (next) {
          if (next) draw(host, next);
          apply();
        })
        .catch(function (error) { note(host, error.message); });
    });
    host.append(box);
  }

  function devices(host, state) {
    const lights = state.lights || [];
    if (!lights.length) {
      const empty = document.createElement("p");
      empty.className = "note";
      empty.textContent = state.hasKey ? (state.lightError || "Цветных ламп нет.") : "Ключ ещё не сохранён.";
      host.append(empty);
      return;
    }
    const picked = {};
    (state.devices || []).forEach(function (id) { picked[id] = true; });
    const box = document.createElement("div");
    box.className = "plugin-devices";
    lights.forEach(function (lamp) {
      const label = document.createElement("label");
      label.className = "check";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!picked[lamp.id];
      input.addEventListener("change", function () {
        const ids = [];
        box.querySelectorAll("input").forEach(function (node, index) { if (node.checked) ids.push(lights[index].id); });
        post("/devices", { ids: ids }).catch(function (error) { note(host, error.message); });
      });
      label.append(input, document.createTextNode(" " + (lamp.name || "Лампа")));
      box.append(label);
    });
    host.append(box);
  }

  function open() {
    try {
      closeCard();
      if (!opt) return;
      const card = document.createElement("div");
      card.id = "plugin-card";
      card.className = "plugin-card";
      const head = document.createElement("div");
      head.className = "plugin-head";
      const title = document.createElement("b");
      title.textContent = "Плагины";
      const shut = document.createElement("button");
      shut.type = "button";
      shut.textContent = "×";
      shut.title = "Закрыть";
      shut.addEventListener("click", closeCard);
      head.append(title, shut);
      const body = document.createElement("div");
      card.append(head, body);
      document.body.append(card);
      refresh().then(function (state) {
        if (!state) {
          note(body, "Список плагинов не открылся.");
          return;
        }
        draw(body, state);
      });
    } catch (err) { /* меню плагинов не роняет ширму */ }
  }

  let loupe = null;
  let dropper = null;

  function closeLoupe() {
    if (loupe) loupe.remove();
    loupe = null;
    dropper = null;
    document.removeEventListener("pointermove", onLoupeMove, true);
    document.removeEventListener("pointerdown", onLoupePick, true);
    document.removeEventListener("keydown", onLoupeKey, true);
  }

  function onLoupeKey(event) {
    if (event.key === "Escape") closeLoupe();
  }

  function contain(box, nw, nh) {
    const scale = Math.min(box.width / nw, box.height / nh);
    const w = nw * scale;
    const h = nh * scale;
    return { x: box.left + (box.width - w) / 2, y: box.top + (box.height - h) / 2, w: w, h: h, scale: scale };
  }

  function onLoupeMove(event) {
    if (!dropper || !loupe) return;
    const photo = document.querySelector(".map-photo");
    if (!photo) return;
    const box = photo.getBoundingClientRect();
    const fit = contain(box, dropper.image.naturalWidth, dropper.image.naturalHeight);
    const inside = event.clientX >= fit.x && event.clientY >= fit.y && event.clientX <= fit.x + fit.w && event.clientY <= fit.y + fit.h;
    loupe.hidden = !inside;
    if (!inside) return;
    const px = (event.clientX - fit.x) / fit.scale;
    const py = (event.clientY - fit.y) / fit.scale;
    const ctx = loupe.querySelector("canvas").getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#07090e";
    ctx.fillRect(0, 0, 130, 130);
    ctx.drawImage(dropper.image, px - 6, py - 6, 13, 13, 0, 0, 130, 130);
    ctx.strokeStyle = "#e6c36a";
    ctx.strokeRect(60, 60, 10, 10);
    const pixel = dropper.read(px, py);
    loupe.querySelector("b").textContent = pixel ? (pixel.h + " " + pixel.s + " " + pixel.v) : "";
    loupe.style.left = Math.min(window.innerWidth - 150, event.clientX + 16) + "px";
    loupe.style.top = Math.min(window.innerHeight - 170, event.clientY + 16) + "px";
  }

  function onLoupePick(event) {
    if (!dropper) return;
    const card = document.getElementById("lamp-card");
    if (card && card.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    const photo = document.querySelector(".map-photo");
    if (!photo || !dropper.loc) { closeLoupe(); return; }
    const box = photo.getBoundingClientRect();
    const fit = contain(box, dropper.image.naturalWidth, dropper.image.naturalHeight);
    const px = (event.clientX - fit.x) / fit.scale;
    const py = (event.clientY - fit.y) / fit.scale;
    const pixel = dropper.read(px, py);
    if (pixel) {
      dropper.loc.lampColor = pixel.hex;
      const swatch = document.querySelector('[data-lamp="' + dropper.loc.id + '"]');
      if (swatch) swatch.style.setProperty("--swatch", pixel.hex);
      const input = card && card.querySelector("[data-lamp-color]");
      if (input) input.value = pixel.hex;
      if (dropper.loc.lamp === true) apply();
      try { if (opt && opt.save) opt.save(); } catch (err) {}
    }
    closeLoupe();
  }

  function eyedrop(loc, imageUrl) {
    closeLoupe();
    if (!imageUrl) return;
    const image = new Image();
    image.onload = function () {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      try { ctx.drawImage(image, 0, 0); }
      catch (err) { return; }
      loupe = document.createElement("div");
      loupe.className = "lamp-loupe";
      loupe.hidden = true;
      const view = document.createElement("canvas");
      view.width = 130;
      view.height = 130;
      const label = document.createElement("b");
      loupe.append(view, label);
      document.body.append(loupe);
      dropper = {
        loc: loc,
        image: image,
        read: function (x, y) {
          try {
            const pixel = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
            const hex = "#" + [pixel[0], pixel[1], pixel[2]].map(function (n) { return n.toString(16).padStart(2, "0"); }).join("");
            const hsv = lampHsv(pixel[0], pixel[1], pixel[2]);
            return { hex: hex, h: hsv.h, s: hsv.s, v: hsv.v };
          } catch (err) { return null; }
        }
      };
      document.addEventListener("pointermove", onLoupeMove, true);
      document.addEventListener("pointerdown", onLoupePick, true);
      document.addEventListener("keydown", onLoupeKey, true);
    };
    image.src = imageUrl;
  }

  function lamp(loc, anchor) {
    try {
      const old = document.getElementById("lamp-card");
      if (old) old.remove();
      if (!loc || !enabled) return;
      const card = document.createElement("div");
      card.id = "lamp-card";
      card.className = "lamp-card";
      const on = document.createElement("label");
      on.className = "check";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = loc.lamp === true;
      on.append(box, document.createTextNode(" Включить подсветку"));
      const color = document.createElement("input");
      color.type = "color";
      color.setAttribute("data-lamp-color", "");
      color.value = (/^#[0-9a-f]{6}$/i.test(loc.lampColor || "") && loc.lampColor) || tones[loc.id] || BACK;
      const pick = document.createElement("button");
      pick.type = "button";
      pick.textContent = "Пипетка";
      card.append(on, color, pick);
      document.body.append(card);
      const rect = anchor.getBoundingClientRect();
      card.style.left = Math.min(window.innerWidth - 220, rect.right + 8) + "px";
      card.style.top = Math.max(8, rect.top) + "px";
      box.addEventListener("change", function () {
        loc.lamp = box.checked;
        anchor.classList.toggle("is-on", box.checked);
        try { if (opt && opt.save) opt.save(); } catch (err) {}
        apply();
      });
      color.addEventListener("input", function () {
        loc.lampColor = color.value;
        anchor.style.setProperty("--swatch", color.value);
        try { if (opt && opt.save) opt.save(); } catch (err) {}
        if (loc.lamp === true) apply();
      });
      pick.addEventListener("click", function () { eyedrop(loc, placeImage); });
      setTimeout(function () {
        function away(event) {
          if (card.contains(event.target) || anchor.contains(event.target)) return;
          card.remove();
          document.removeEventListener("pointerdown", away, true);
        }
        document.addEventListener("pointerdown", away, true);
      }, 0);
    } catch (err) {}
  }

  window.ShirmoPlugins = {
    arm: function (next) {
      try {
        opt = next;
        refresh().then(function () {
          try { if (opt && opt.ready) opt.ready(); } catch (err) {}
        });
      } catch (err) {}
    },
    on: function () {
      try { return enabled; }
      catch (err) { return false; }
    },
    open: open,
    place: function (loc, image) {
      try {
        placeLoc = loc || null;
        placeImage = image || "";
        if (loc && image && !loc.lampColor && !tones[loc.id]) sample(image, loc);
        apply();
      } catch (err) {}
    },
    turn: function (row) {
      try {
        actor = row || null;
        apply();
      } catch (err) {}
    },
    effect: function (kind) {
      try {
        effect = FX[kind] ? kind : "";
        apply();
      } catch (err) {}
    },
    lamp: lamp,
    dockHtml: function () {
      try {
        if (!enabled) return "";
        return '<details class="dock-fold" data-fold="light" open><summary>Подсветка</summary>' +
          '<div class="dock-form light-form"><label>Цвет<input data-light="force" type="color" value="#e6c36a" aria-label="Свой цвет"></label>' +
          '<button type="button" data-light="auto"' + (auto ? ' class="is-on"' : "") + ">Авто</button></div></details>";
      } catch (err) { return ""; }
    },
    bindDock: function (root) {
      try {
        const force = root.querySelector("[data-light=force]");
        const button = root.querySelector("[data-light=auto]");
        if (force) force.addEventListener("input", function () {
          auto = false;
          if (button) button.classList.remove("is-on");
          const hsv = hexHsv(force.value);
          post("/auto", { on: false }).catch(function () {});
          if (hsv) queue(hsv, true);
        });
        if (button) button.addEventListener("click", function () {
          auto = true;
          button.classList.add("is-on");
          lastKey = "";
          post("/auto", { on: true }).then(function () { apply(); }).catch(function () {});
        });
      } catch (err) {}
    }
  };
})();
