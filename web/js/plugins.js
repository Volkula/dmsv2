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
      },
      roomId: opt && opt.roomId || "",
      headers: opt && opt.headers || null,
      upload: opt && opt.upload || null,
      keep: opt && opt.keep || null,
      library: opt && opt.library || function () { return { images: [], notes: [] }; },
      saveNote: opt && opt.saveNote || null
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
        try { eachOn(function (mod) { if (mod.boot) mod.boot(env()); }); } catch (err) {}
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

  function repoOf(src) {
    const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\//i.exec(String(src || ""));
    return match ? "https://github.com/" + match[1] : "";
  }

  function gitLink(url, label) {
    const link = document.createElement("a");
    link.className = "plugin-git";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = "Репозиторий";
    link.setAttribute("aria-label", "Репозиторий " + label);
    link.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.7 7.7 0 0 1 8 4.77c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';
    return link;
  }

  function pluginRow(host, row) {
    const block = document.createElement("article");
    block.className = "plugin-row";
    const head = document.createElement("header");
    const who = document.createElement("span");
    who.className = "plugin-name";
    const name = document.createElement("b");
    name.textContent = row.name || row.id;
    who.append(name);
    if (row.version) {
      const ver = document.createElement("span");
      ver.className = "plugin-ver";
      ver.textContent = row.version;
      who.append(ver);
    }
    if (row.repo) who.append(gitLink(row.repo, row.name || row.id));
    const status = document.createElement("span");
    status.className = "plugin-state" + (row.on ? " is-on" : "");
    status.textContent = row.on ? "включена" : "выключена";
    head.append(who, status);
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
    const catalog = state.catalog || [];
    function extra(id) {
      const item = catalog.find(function (row) { return row && row.id === id; }) || {};
      return { version: item.version || "", repo: repoOf(item.src) };
    }
    const installed = (state.installed || []).map(function (row) {
      const meta = extra(row.id);
      return { id: row.id, name: row.name || row.id, on: row.on === true, fresh: false, version: meta.version, repo: meta.repo };
    });
    const have = {};
    installed.forEach(function (row) { have[row.id] = true; });
    catalog.forEach(function (row) {
      if (!row || !row.id || !row.name || have[row.id]) return;
      installed.push({ id: row.id, name: row.name, on: false, fresh: true, version: row.version || "", repo: repoOf(row.src) });
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
    },
    panels: function () {
      const list = [];
      const installed = (latest && latest.installed) || [];
      try {
        eachOn(function (mod) {
          const hasModule = !!(mod.module && typeof mod.module.mount === "function");
          const hasSettings = mod.id !== "melk-lamps" && typeof mod.settings === "function";
          const hasDock = typeof mod.dockHtml === "function";
          if (!hasModule && !hasSettings && !hasDock) return;
          const row = installed.find(function (item) { return item && item.id === mod.id; });
          list.push({
            id: mod.id,
            title: (hasModule && mod.module.title) || (row && row.name) || mod.id,
            icon: (hasModule && mod.module.icon) || "",
            mount: hasModule ? mod.module.mount : null,
            settings: hasSettings ? function () { return mod.settings(env()); } : null,
            dockHtml: hasDock ? function () { return mod.dockHtml(env()) || ""; } : null,
            bindDock: typeof mod.bindDock === "function" ? function (root) { mod.bindDock(root, env()); } : null,
            stop: hasModule && typeof mod.module.stop === "function" ? mod.module.stop : null
          });
        });
      } catch (err) {}
      return list;
    }
  };
})();
