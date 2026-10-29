(function () {
  let opt = null;
  let latest = null;
  let enabled = false;
  const mods = {};
  const loading = {};

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

  function env(state) {
    const bag = state || latest || {};
    return {
      post: function (path, body) {
        if (path === "/devices" && body && Array.isArray(body.ids)) {
          const ids = body.ids.map(function (id) { return String(id || "").slice(0, 80); }).filter(Boolean);
          bag.devices = ids.slice();
          const light = lightBag();
          if (light) light.devices = ids.slice();
        }
        if (path === "/auto" && body && typeof body.on === "boolean") {
          bag.auto = body.on;
          const light = lightBag();
          if (light) light.auto = body.on;
        }
        return post(path, body);
      },
      state: bag,
      campaign: function () { return opt && opt.campaign ? opt.campaign() : {}; },
      save: function () { try { if (opt && opt.save) opt.save(); } catch (err) {} },
      fightOn: function () { try { return !!(opt && opt.fightOn && opt.fightOn()); } catch (err) { return false; } },
      redraw: function () { open(); },
      note: function (text) {
        const host = document.querySelector("#plugin-card .pop-body");
        if (host) note(host, text);
      }
    };
  }

  function eachOn(fn) {
    const rows = (latest && latest.installed) || [];
    rows.forEach(function (row) {
      if (!row.on || !mods[row.id]) return;
      try { fn(mods[row.id], row); } catch (err) {}
    });
  }

  function markEnabled() {
    enabled = false;
    eachOn(function (mod) { if (mod.mapFlag) enabled = true; });
  }

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      if (!url) { reject(); return; }
      const script = document.createElement("script");
      script.src = url + (url.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now();
      script.onload = function () { resolve(); };
      script.onerror = function () { script.remove(); reject(); };
      document.head.appendChild(script);
    });
  }

  function ensure(item) {
    if (!item || !item.id || mods[item.id]) return Promise.resolve();
    if (loading[item.id]) return loading[item.id];
    const local = "/plugins/" + item.id + "/plugin.js";
    const job = (item.src ? loadScript(item.src) : Promise.reject()).catch(function () {
      return loadScript(local);
    }).catch(function () {});
    loading[item.id] = job;
    return job;
  }

  function lightBag() {
    const campaign = opt && opt.campaign && opt.campaign();
    if (!campaign) return null;
    if (!campaign.plugins || typeof campaign.plugins !== "object" || Array.isArray(campaign.plugins)) campaign.plugins = {};
    if (!campaign.plugins.light || typeof campaign.plugins.light !== "object" || Array.isArray(campaign.plugins.light)) campaign.plugins.light = {};
    return campaign.plugins.light;
  }

  function remember(state) {
    latest = state;
    try {
      const campaign = opt && opt.campaign && opt.campaign();
      if (!campaign || !state || !Array.isArray(state.installed)) return;
      if (!campaign.plugins || typeof campaign.plugins !== "object" || Array.isArray(campaign.plugins)) campaign.plugins = {};
      const prev = Array.isArray(campaign.plugins.installed) ? campaign.plugins.installed : [];
      campaign.plugins.installed = state.installed.map(function (row) {
        const old = prev.find(function (item) { return item && item.id === row.id; }) || {};
        return { id: row.id, name: row.name || old.name || row.id, on: row.on === true };
      });
      const light = lightBag();
      if (light && Array.isArray(state.devices)) light.devices = state.devices.slice();
      if (light && typeof state.auto === "boolean") light.auto = state.auto;
    } catch (err) {}
  }

  function refresh() {
    if (!opt) return Promise.resolve(null);
    return post("", null).then(function (state) {
      remember(state);
      const jobs = (state.catalog || []).concat(state.installed || []).map(ensure);
      return Promise.all(jobs).then(function () {
        markEnabled();
        if (state.auto != null) { /* плагин читает auto из state */ }
        try { if (opt && opt.ready) opt.ready(); } catch (err) {}
        return state;
      });
    }).catch(function () { return null; });
  }

  window.ShirmoHost = {
    add: function (mod) {
      try {
        if (!mod || !/^[a-z0-9-]{2,40}$/.test(mod.id || "")) return;
        mods[mod.id] = mod;
        markEnabled();
      } catch (err) {}
    }
  };
  window.dispatchEvent(new Event("shirmo-host"));

  function onPlugKey(event) {
    if (event.key === "Escape") closeCard();
  }

  function closeCard() {
    const old = document.getElementById("plugin-card");
    if (old) old.remove();
    document.removeEventListener("keydown", onPlugKey);
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

  function note(host, text) {
    if (!host) return;
    let row = host.querySelector(".plugin-note");
    if (!row) {
      row = document.createElement("p");
      row.className = "note plugin-note";
      host.append(row);
    }
    row.textContent = text || "";
  }

  const skipKey = "shirmo-plugin-skip-pass";

  function skipPass() {
    try { return localStorage.getItem(skipKey) === "1"; }
    catch (err) { return false; }
  }

  function setSkipPass(on) {
    try { localStorage.setItem(skipKey, on ? "1" : "0"); }
    catch (err) {}
  }

  function sessionPassword() {
    const auth = (opt && opt.headers && opt.headers.authorization) || "";
    const match = /^Bearer\s+(\S+)/i.exec(auth);
    return match ? match[1] : "";
  }

  function secretForm(slot, done) {
    slot.innerHTML = "";
    const box = document.createElement("form");
    box.className = "plugin-form";
    const pass = field("Пароль комнаты", "password");
    const acts = document.createElement("div");
    acts.className = "plugin-acts";
    const go = document.createElement("button");
    go.type = "submit";
    go.textContent = "Включить";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Отмена";
    cancel.addEventListener("click", function () { slot.innerHTML = ""; });
    acts.append(go, cancel);
    box.append(pass.wrap, acts);
    box.addEventListener("submit", function (event) {
      event.preventDefault();
      const password = pass.input.value;
      pass.input.value = "";
      done(password);
    });
    slot.append(box);
    pass.input.focus();
  }

  function enableRow(host, slot, row) {
    function go(password) {
      const chain = row.fresh ? post("/install", { id: row.id }) : Promise.resolve();
      chain.then(function () {
        return post("/enable", { id: row.id, password: password });
      }).then(refresh).then(function (next) {
        if (next) draw(host, next);
      }).catch(function (error) { note(host, error.message); });
    }
    if (skipPass()) {
      const password = sessionPassword();
      if (password) {
        go(password);
        return;
      }
    }
    secretForm(slot, go);
  }

  function pluginRow(host, row) {
    const block = document.createElement("article");
    block.className = "plugin-row";
    const head = document.createElement("header");
    const name = document.createElement("b");
    name.textContent = row.name || row.id;
    const status = document.createElement("span");
    status.className = "plugin-state" + (row.on ? " is-on" : "");
    status.textContent = row.on ? "включена" : "выключена";
    head.append(name, status);
    const acts = document.createElement("div");
    acts.className = "plugin-acts";
    const on = document.createElement("button");
    on.type = "button";
    on.textContent = "Включить";
    on.disabled = row.on === true;
    const off = document.createElement("button");
    off.type = "button";
    off.textContent = "Отключить";
    off.disabled = row.on !== true;
    const slot = document.createElement("div");
    slot.className = "plugin-slot";
    on.addEventListener("click", function () { enableRow(host, slot, row); });
    off.addEventListener("click", function () {
      post("/disable", { id: row.id }).then(refresh).then(function (next) {
        if (next) draw(host, next);
      }).catch(function (error) { note(host, error.message); });
    });
    acts.append(on, off);
    block.append(head, acts, slot);
    if (!row.fresh && !mods[row.id]) {
      const missing = document.createElement("p");
      missing.className = "note";
      missing.textContent = "Код плагина не загрузился.";
      block.append(missing);
    }
    return block;
  }

  function catalogRows(state) {
    const installed = (state.installed || []).map(function (row) {
      return { id: row.id, name: row.name || row.id, on: row.on === true, fresh: false };
    });
    const have = {};
    installed.forEach(function (row) { have[row.id] = true; });
    (state.catalog || []).forEach(function (row) {
      if (!row || !row.id || !row.name || have[row.id]) return;
      installed.push({ id: row.id, name: row.name, on: false, fresh: true });
    });
    return installed;
  }

  function draw(host, state) {
    host.innerHTML = "";
    const bar = document.createElement("div");
    bar.className = "plugin-acts";
    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.textContent = "Обновить список";
    refreshBtn.addEventListener("click", function () {
      Object.keys(loading).forEach(function (id) { if (!mods[id]) delete loading[id]; });
      refresh().then(function (next) {
        if (next) draw(host, next);
        else note(host, "Список не обновился.");
      });
    });
    const skip = document.createElement("label");
    skip.className = "check";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = skipPass();
    box.addEventListener("change", function () { setSkipPass(box.checked); });
    skip.append(box, document.createTextNode(" Не спрашивать пароль комнаты"));
    bar.append(refreshBtn, skip);
    host.append(bar);
    const rows = catalogRows(state);
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "note";
      empty.textContent = "Список не загрузился.";
      host.append(empty);
      return;
    }
    rows.forEach(function (row) { host.append(pluginRow(host, row)); });
  }

  function open() {
    try {
      closeCard();
      if (!opt) return;
      const card = document.createElement("div");
      card.id = "plugin-card";
      card.className = "plugin-layer";
      const sheet = document.createElement("div");
      sheet.className = "pop-card plugin-pop";
      const head = document.createElement("div");
      head.className = "pop-head";
      const title = document.createElement("h2");
      title.textContent = "Плагины";
      const shut = document.createElement("button");
      shut.type = "button";
      shut.textContent = "×";
      shut.title = "Закрыть";
      shut.setAttribute("aria-label", "Закрыть");
      shut.addEventListener("click", closeCard);
      head.append(title, shut);
      const body = document.createElement("div");
      body.className = "pop-body";
      sheet.append(head, body);
      card.append(sheet);
      card.addEventListener("click", function (event) {
        if (event.target === card) closeCard();
      });
      document.body.append(card);
      document.addEventListener("keydown", onPlugKey);
      refresh().then(function (state) {
        if (!state) {
          note(body, "Список плагинов не открылся.");
          return;
        }
        draw(body, state);
      });
    } catch (err) { /* меню плагинов не роняет ширму */ }
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
      try { eachOn(function (mod) { if (mod.place) mod.place(loc, image, env()); }); }
      catch (err) {}
    },
    turn: function (row) {
      try { eachOn(function (mod) { if (mod.turn) mod.turn(row, env()); }); }
      catch (err) {}
    },
    effect: function (kind) {
      try { eachOn(function (mod) { if (mod.effect) mod.effect(kind, env()); }); }
      catch (err) {}
    },
    lamp: function (loc, anchor) {
      try { eachOn(function (mod) { if (mod.lamp) mod.lamp(loc, anchor, env()); }); }
      catch (err) {}
    },
    forms: function () {
      const list = [];
      try {
        eachOn(function (mod) {
          if (mod.id === "melk-lamps" || typeof mod.settings !== "function") return;
          list.push({ id: mod.id, mount: mod.settings, env: env() });
        });
      } catch (err) {}
      return list;
    },
    dockHtml: function () {
      try {
        let html = "";
        eachOn(function (mod) { if (mod.dockHtml) html += mod.dockHtml(env()) || ""; });
        return html;
      } catch (err) { return ""; }
    },
    bindDock: function (root) {
      try { eachOn(function (mod) { if (mod.bindDock) mod.bindDock(root, env()); }); }
      catch (err) {}
    },
    paintOthers: function (exceptId, hex, bright) {
      const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
      if (!match) return;
      const num = parseInt(match[1], 16);
      const rgb = [(num >> 16) & 255, (num >> 8) & 255, num & 255];
      const level = Math.max(0, Math.min(100, Math.round(Number(bright) || 0)));
      try {
        eachOn(function (mod) {
          if (!mod.rgb || typeof mod.rgb.frame !== "function" || mod.id === exceptId) return;
          if (mod.rgb.ready && !mod.rgb.ready()) return;
          mod.rgb.frame(rgb, level, true);
        });
      } catch (err) {}
    },
    rgb: function () {
      const list = [];
      try {
        eachOn(function (mod) {
          if (mod.rgb && typeof mod.rgb.frame === "function") list.push(mod.rgb);
        });
      } catch (err) {}
      return list;
    },
    modules: function () {
      const list = [];
      try {
        eachOn(function (mod) {
          if (!mod.module || typeof mod.module.mount !== "function") return;
          list.push({
            id: mod.id,
            title: mod.module.title || mod.id,
            icon: mod.module.icon || "",
            mount: mod.module.mount,
            stop: typeof mod.module.stop === "function" ? mod.module.stop : null
          });
        });
      } catch (err) {}
      return list;
    }
  };
})();
