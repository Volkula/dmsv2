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
    const job = loadScript(local).catch(function () {
      return item.src ? loadScript(item.src) : Promise.reject();
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

  function heading(text) {
    const node = document.createElement("h3");
    node.textContent = text;
    return node;
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

  function secretForm(slot, row) {
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
      post("/enable", { id: row.id, password: password }).then(refresh).then(function (next) {
        const host = slot.closest(".pop-body");
        if (next && host) draw(host, next);
      }).catch(function (error) { note(slot.closest(".pop-body"), error.message); });
    });
    slot.append(box);
  }

  function pluginRow(host, state, row) {
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
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = row.on ? "Выключить" : "Включить";
    const slot = document.createElement("div");
    slot.className = "plugin-slot";
    toggle.addEventListener("click", function () {
      if (row.on) {
        post("/disable", { id: row.id }).then(refresh).then(function (next) {
          if (next) draw(host, next);
        }).catch(function (error) { note(host, error.message); });
        return;
      }
      secretForm(slot, row);
    });
    const drop = document.createElement("button");
    drop.type = "button";
    drop.textContent = "Убрать";
    drop.addEventListener("click", function () {
      post("/remove", { id: row.id }).then(refresh).then(function (next) {
        if (next) draw(host, next);
      }).catch(function (error) { note(host, error.message); });
    });
    acts.append(toggle, drop);
    block.append(head, acts, slot);
    const mod = mods[row.id];
    if (!mod) {
      const missing = document.createElement("p");
      missing.className = "note";
      missing.textContent = "Код плагина не загрузился.";
      block.append(missing);
      return block;
    }
    if (row.on && mod.settings) {
      try { block.append(mod.settings(env(state))); }
      catch (err) {}
    }
    return block;
  }

  function draw(host, state) {
    host.innerHTML = "";
    host.append(heading("В комнате"));
    const installed = state.installed || [];
    if (!installed.length) {
      const empty = document.createElement("p");
      empty.className = "note";
      empty.textContent = "Плагинов нет.";
      host.append(empty);
    }
    installed.forEach(function (row) { host.append(pluginRow(host, state, row)); });
    host.append(heading("Добавить"));
    const have = {};
    installed.forEach(function (row) { have[row.id] = true; });
    const list = (state.catalog || []).filter(function (row) { return row && row.name && !have[row.id]; });
    if (!list.length) {
      const empty = document.createElement("p");
      empty.className = "note";
      empty.textContent = (state.catalog || []).length ? "Новых плагинов нет." : "Список не загрузился.";
      host.append(empty);
      return;
    }
    list.forEach(function (row) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "plugin-add";
      button.textContent = row.name;
      button.addEventListener("click", function () {
        post("/install", { id: row.id }).then(refresh).then(function (next) {
          if (next) draw(host, next);
        }).catch(function (error) { note(host, error.message); });
      });
      host.append(button);
    });
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
