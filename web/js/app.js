(function () {
  const app = document.getElementById("app");
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const masterMatch = path.match(/^\/m\/([^/]+)$/);
  const viewerMatch = path.match(/^\/v\/([^/]+)$/);

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function keyName(id) {
    return "shirmo-key-" + id;
  }

  function takeKey(id) {
    const query = new URLSearchParams(location.search);
    const fromUrl = query.get("k");
    if (fromUrl) {
      sessionStorage.setItem(keyName(id), fromUrl);
      history.replaceState(null, "", location.pathname);
      return fromUrl;
    }
    return sessionStorage.getItem(keyName(id)) || "";
  }

  async function api(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || "ошибка");
    return data;
  }

  function fontStack(name) {
    return "'" + String(name || "Шрифт").replace(/'/g, "") + "', sans-serif";
  }

  const FONTS = [
    ["Georgia", "Georgia, serif"],
    ["Arial", "Arial, sans-serif"],
    ["Times", "Times New Roman, serif"],
    ["Verdana", "Verdana, sans-serif"],
    ["Courier", "Courier New, monospace"]
  ];

  function textLook(page) {
    const ink = page && page.ink || "#f3ead8";
    const font = page && page.font || "Georgia, serif";
    const size = Math.min(160, Math.max(16, Number(page && page.size) || 64));
    return {
      title: "color:" + esc(ink) + ";font-family:" + esc(font) + ";font-size:" + size + "px",
      body: "color:" + esc(ink) + ";font-family:" + esc(font) + ";font-size:" + Math.max(16, Math.round(size * 0.45)) + "px",
      flash: "color:" + esc(ink) + ";font-family:" + esc(font) + ";font-size:" + size + "px"
    };
  }

  function faceCss(page) {
    if (!page || !page.fontUrl) return "";
    const name = String(page.font || "").split(",")[0].trim().replace(/^['"]|['"]$/g, "").replace(/'/g, "");
    return "@font-face{font-family:'" + name + "';src:url('" + page.fontUrl + "');}";
  }

  function stageHtml(frame) {
    const page = frame && frame.page;
    if (!page) return '<div class="stage" style="background:#16130f"></div>';
    if (page.kind === "map" && window.ShirmoMap) return window.ShirmoMap.html(page, false);
    const image = page.image ? "url('" + esc(page.image) + "')" : "none";
    const look = textLook(page);
    const face = faceCss(page);
    return (face ? "<style>" + face + "</style>" : "") +
      '<div class="stage" style="background-color:' + esc(page.color || "#16130f") + ";background-image:" + image + '">' +
      '<h2 style="' + look.title + '">' + esc(page.title || page.name || "") + "</h2>" +
      '<p style="' + look.body + '">' + esc(page.text || "") + "</p></div>";
  }

  function fit(root) {
    const stage = root.querySelector(".stage");
    if (!stage) return;
    const scale = Math.min(root.clientWidth / 1368, root.clientHeight / 786);
    stage.style.transform = "scale(" + (scale || 1) + ")";
  }
  window.ShirmoFit = fit;

  function home() {
    app.innerHTML = '<section class="gate"><form class="card" id="create">' +
      "<h1>Ширма</h1>" +
      '<p class="note">Комната на этом сервере. Мастер получает ссылку для правки, игроки — ссылку на экран.</p>' +
      '<label>Название<input name="title" value="Новая комната" required></label>' +
      '<div class="row"><button class="primary" type="submit">Создать комнату</button></div>' +
      '<p class="error" id="err"></p></form></section>';
    app.querySelector("#create").addEventListener("submit", async function (event) {
      event.preventDefault();
      const title = new FormData(event.target).get("title");
      try {
        const room = await api("/api/rooms", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: title })
        });
        sessionStorage.setItem(keyName(room.id), room.masterKey);
        location.href = "/m/" + room.id;
      } catch (err) {
        app.querySelector("#err").textContent = err.message;
      }
    });
  }

  function viewer(id) {
    app.innerHTML = '<section class="viewer"><div class="stage-wrap" id="view"></div></section>';
    const view = app.querySelector("#view");
    let flashTimer = 0;
    function paint(frame, event) {
      if (event && event.type === "ping") {
        const stage = view.querySelector(".stage");
        if (stage && window.ShirmoMap) window.ShirmoMap.ping(stage, event.x, event.y, event.look);
        return;
      }
      const look = textLook(frame && frame.page);
      view.innerHTML = stageHtml(frame) + (event ? '<div class="flash" style="' + look.flash + '">' + esc(event.text) + "</div>" : "");
      fit(view);
      if (event) {
        clearTimeout(flashTimer);
        flashTimer = setTimeout(function () { paint(frame, null); }, 4000);
      }
    }
    const source = new EventSource("/api/rooms/" + id + "/events");
    let frame = null;
    source.onmessage = function (message) {
      const data = JSON.parse(message.data);
      if (data.type === "frame") {
        frame = data.frame;
        paint(frame, null);
      }
      if (data.type === "event" && frame) paint(frame, data.event);
    };
    window.addEventListener("resize", function () { fit(view); });
  }

  function rollFormula(spec) {
    const mode = spec.mode === "advantage" || spec.mode === "disadvantage" ? spec.mode : "normal";
    if (mode !== "normal") {
      const a = 1 + Math.floor(Math.random() * 20);
      const b = 1 + Math.floor(Math.random() * 20);
      const total = mode === "advantage" ? Math.max(a, b) : Math.min(a, b);
      return {
        name: spec.name || "",
        count: 2,
        sides: 20,
        mode: mode,
        total: total,
        log: a + " · " + b + " → " + total,
        label: mode === "advantage" ? "Преимущество" : "Помеха"
      };
    }
    const sides = [4, 6, 8, 10, 12, 20, 100].indexOf(Number(spec.sides)) >= 0 ? Number(spec.sides) : 20;
    const count = Math.min(12, Math.max(1, Number(spec.count) || 1));
    const dice = [];
    let total = 0;
    for (let i = 0; i < count; i++) {
      const value = 1 + Math.floor(Math.random() * sides);
      dice.push(value);
      total += value;
    }
    return {
      name: spec.name || "",
      count: count,
      sides: sides,
      mode: "normal",
      total: total,
      log: count === 1 ? String(total) : dice.join("+") + "=" + total,
      label: count + "d" + sides
    };
  }

  function rollText(roll) {
    const title = roll.name ? roll.name + ": " : "";
    return title + (roll.label ? roll.label + " " : "") + roll.log;
  }

  function sourceLabel(pin) {
    if (pin.source === "codex") return "Справочник";
    if (pin.source === "npc") return "НПС";
    return "Свой";
  }

  function openRolls(roomId, headers, state, err) {
    const old = document.getElementById("pop");
    if (old) old.remove();
    const pop = document.createElement("div");
    pop.id = "pop";
    pop.className = "pop";
    pop.innerHTML = '<div class="pop-card" role="dialog" aria-label="Броски">' +
      '<div class="pop-head"><h2>Броски</h2><button type="button" data-pop-close>×</button></div>' +
      '<div class="die-row"><button type="button" data-tab="new" class="is-on">Новый</button>' +
      '<button type="button" data-tab="history">История</button>' +
      '<button type="button" data-tab="pins">Закреплённые</button></div>' +
      '<div id="roll-pane"></div></div>';
    document.body.appendChild(pop);
    let tab = "new";
    let sides = 20;
    function close() { pop.remove(); }
    pop.querySelector("[data-pop-close]").addEventListener("click", close);
    pop.addEventListener("click", function (event) { if (event.target === pop) close(); });
    pop.addEventListener("keydown", function (event) { if (event.key === "Escape") close(); });

    async function throwSpec(spec) {
      const roll = rollFormula(spec);
      const text = rollText(roll);
      try {
        const data = await api("/api/rooms/" + roomId + "/events", {
          method: "POST",
          headers: headers,
          body: JSON.stringify({ type: "die", text: text, roll: roll })
        });
        state.rolls = data.rolls || state.rolls;
        err.textContent = "";
        if (tab === "history") paint();
      } catch (error) {
        err.textContent = error.message;
      }
    }

    function paint() {
      pop.querySelectorAll("[data-tab]").forEach(function (button) {
        button.classList.toggle("is-on", button.getAttribute("data-tab") === tab);
      });
      const pane = pop.querySelector("#roll-pane");
      if (tab === "history") {
        pane.innerHTML = state.rolls.length
          ? '<div class="roll-list">' + state.rolls.map(function (roll) {
            const when = new Date(roll.at).toLocaleString("ru");
            return '<p class="note">' + esc(when) + " — " + esc(roll.text) + "</p>";
          }).join("") + "</div>"
          : '<p class="roll-empty">Пока пусто</p>';
        return;
      }
      if (tab === "pins") {
        pane.innerHTML = state.pins.length
          ? '<div class="roll-list">' + state.pins.map(function (pin) {
            const where = sourceLabel(pin) + (pin.sourceName ? " · " + pin.sourceName : "");
            return '<div class="pin-line"><button type="button" data-pin="' + esc(pin.id) + '">' +
              esc(pin.name) + " — " + esc(where) + '</button>' +
              '<button type="button" data-unpin="' + esc(pin.id) + '" title="Убрать">×</button></div>';
          }).join("") + "</div>"
          : '<p class="roll-empty">Пока пусто. Сюда попадают шаблоны из справочника и карточки НПС, и те, что закреплены из нового броска.</p>';
        pane.querySelectorAll("[data-pin]").forEach(function (button) {
          button.addEventListener("click", function () {
            const pin = state.pins.find(function (item) { return item.id === button.getAttribute("data-pin"); });
            if (pin) throwSpec(pin);
          });
        });
        pane.querySelectorAll("[data-unpin]").forEach(function (button) {
          button.addEventListener("click", async function () {
            try {
              const data = await api("/api/rooms/" + roomId + "/pins/" + button.getAttribute("data-unpin"), {
                method: "DELETE",
                headers: headers
              });
              state.pins = data.pins || [];
              paint();
            } catch (error) {
              err.textContent = error.message;
            }
          });
        });
        return;
      }
      const dice = [4, 6, 8, 10, 12, 20, 100].map(function (n) {
        return '<button type="button" data-sides="' + n + '"' + (n === sides ? ' class="is-on"' : "") + ">d" + n + "</button>";
      }).join("");
      pane.innerHTML = '<div class="die-row"><label>Название<input id="die-name" type="text" placeholder="Атака мечом"></label></div>' +
        '<div class="die-row"><label>Количество <input id="die-count" type="number" min="1" max="12" value="1"></label>' +
        '<div class="die-sides">' + dice + "</div></div>" +
        '<div class="die-row"><label class="check"><input id="die-adv" type="checkbox"> С преимуществом</label>' +
        '<label class="check"><input id="die-dis" type="checkbox"> С помехой</label></div>' +
        '<p class="note" id="die-hint"></p>' +
        '<div class="row"><button type="button" class="primary" id="die-throw">Бросить</button>' +
        '<button type="button" id="die-pin">Закрепить</button></div>';
      const count = pane.querySelector("#die-count");
      const adv = pane.querySelector("#die-adv");
      const dis = pane.querySelector("#die-dis");
      const hint = pane.querySelector("#die-hint");
      function mode() {
        if (adv.checked) return "advantage";
        if (dis.checked) return "disadvantage";
        return "normal";
      }
      function syncHint() {
        const special = mode() !== "normal";
        count.disabled = special;
        pane.querySelectorAll("[data-sides]").forEach(function (button) { button.disabled = special; });
        if (adv.checked) hint.textContent = "2d20, берётся больший.";
        else if (dis.checked) hint.textContent = "2d20, берётся меньший.";
        else hint.textContent = Math.min(12, Math.max(1, Number(count.value) || 1)) + "d" + sides;
      }
      syncHint();
      pane.querySelectorAll("[data-sides]").forEach(function (button) {
        button.addEventListener("click", function () {
          if (button.disabled) return;
          sides = Number(button.getAttribute("data-sides"));
          pane.querySelectorAll("[data-sides]").forEach(function (node) {
            node.classList.toggle("is-on", node === button);
          });
          syncHint();
        });
      });
      adv.addEventListener("change", function () {
        if (adv.checked) dis.checked = false;
        syncHint();
      });
      dis.addEventListener("change", function () {
        if (dis.checked) adv.checked = false;
        syncHint();
      });
      count.addEventListener("input", syncHint);
      function currentSpec() {
        return {
          name: pane.querySelector("#die-name").value.trim(),
          count: Number(count.value) || 1,
          sides: sides,
          mode: mode()
        };
      }
      pane.querySelector("#die-throw").addEventListener("click", function () { throwSpec(currentSpec()); });
      pane.querySelector("#die-pin").addEventListener("click", async function () {
        const spec = currentSpec();
        try {
          const data = await api("/api/rooms/" + roomId + "/pins", {
            method: "POST",
            headers: headers,
            body: JSON.stringify(spec)
          });
          state.pins = data.pins || [];
          tab = "pins";
          paint();
        } catch (error) {
          err.textContent = error.message;
        }
      });
    }

    pop.querySelectorAll("[data-tab]").forEach(function (button) {
      button.addEventListener("click", function () {
        tab = button.getAttribute("data-tab");
        paint();
      });
    });
    paint();
  }

  async function master(id) {
    const key = takeKey(id);
    if (!key) {
      app.innerHTML = '<section class="gate"><div class="card"><h1>Нет ключа</h1>' +
        '<p class="note">Откройте ссылку мастера ещё раз. Ключ был в адресе при создании комнаты.</p></div></section>';
      return;
    }
    const headers = { authorization: "Bearer " + key, "content-type": "application/json" };
    let state;
    try {
      state = await api("/api/rooms/" + id + "/campaign", { headers: { authorization: headers.authorization } });
    } catch (err) {
      app.innerHTML = '<section class="gate"><div class="card"><h1>Комната не открылась</h1><p class="error">' + esc(err.message) + "</p></div></section>";
      return;
    }
    const page = function () {
      return state.campaign.pages.find(function (item) { return item.id === state.campaign.activePageId; }) || state.campaign.pages[0];
    };
    const scenePage = function () {
      return state.campaign.pages.find(function (item) { return item.kind !== "map"; }) || state.campaign.pages[0];
    };
    const viewerUrl = location.origin + "/v/" + id;

    app.innerHTML = '<section class="master"><div class="topbar">' +
      '<input id="title" type="text" value="' + esc(state.title) + '" aria-label="Название комнаты">' +
      '<button type="button" id="mode-live" class="' + (state.publishMode === "live" ? "is-on" : "") + '">Сразу</button>' +
      '<button type="button" id="mode-hold" class="' + (state.publishMode === "hold" ? "is-on" : "") + '">Только по кнопке</button>' +
      '<button type="button" class="primary" id="show">Показать</button>' +
      '<button type="button" id="roll">Броски</button>' +
      '<button type="button" id="library">Библиотека</button>' +
      '<button type="button" id="mod-scene" class="is-on">Сцена</button>' +
      '<button type="button" id="mod-map">Карта</button>' +
      '<span class="spacer"></span>' +
      '<button type="button" id="copy-master">Ссылка мастера</button>' +
      '<button type="button" id="copy">Ссылка игроков</button>' +
      '<a href="' + esc(viewerUrl) + '" target="_blank" rel="noopener">Открыть экран</a>' +
      "</div><div class=\"work\" id=\"work-scene\"><aside class=\"side\">" +
      '<label>Заголовок<input id="page-title" type="text"></label>' +
      '<label>Текст<textarea id="page-text"></textarea></label>' +
      '<label>Фон<input id="page-color" type="color"></label>' +
      '<label>Цвет текста<input id="page-ink" type="color"></label>' +
      '<label>Размер <input id="page-size" type="range" min="24" max="140" value="64"></label>' +
      '<label>Шрифт<select id="page-font"></select></label>' +
      '<label>Картинка<select id="page-pick"></select></label>' +
      '<label>Заметка<select id="page-note"></select></label>' +
      '<p class="note">В режиме «Сразу» правки этой страницы уходят игрокам сами. «Показать» публикует кадр в любом режиме. Бросок виден игрокам вспышкой и остаётся в истории.</p>' +
      '<p class="error" id="err"></p></aside>' +
      '<div class="stage-wrap" id="preview"></div></div><div class="work" id="work-map" hidden></div></section>';

    const err = app.querySelector("#err");
    const preview = app.querySelector("#preview");

    function shelf() {
      if (!state.campaign.library) state.campaign.library = { fonts: [], images: [], notes: [] };
      const lib = state.campaign.library;
      lib.fonts = lib.fonts || [];
      lib.images = lib.images || [];
      lib.notes = lib.notes || [];
      return lib;
    }
    function paintChoices() {
      const lib = shelf();
      const current = scenePage();
      const font = app.querySelector("#page-font");
      font.innerHTML = FONTS.map(function (item) {
        return '<option value="' + esc(item[1]) + '">' + esc(item[0]) + "</option>";
      }).join("") + lib.fonts.map(function (item) {
        return '<option value="' + esc(fontStack(item.name)) + '">' + esc(item.name) + "</option>";
      }).join("");
      font.value = current.font || "Georgia, serif";
      if (font.value !== (current.font || "Georgia, serif")) font.value = "Georgia, serif";
      const images = app.querySelector("#page-pick");
      images.innerHTML = '<option value="">Без картинки</option>' + lib.images.map(function (item) {
        return '<option value="' + esc(item.url) + '">' + esc(item.name) + "</option>";
      }).join("");
      images.value = current.image || "";
      const notes = app.querySelector("#page-note");
      notes.innerHTML = '<option value="">—</option>' + lib.notes.map(function (item) {
        return '<option value="' + esc(item.id) + '">' + esc(item.name) + "</option>";
      }).join("");
    }
    function fill() {
      const current = scenePage();
      paintChoices();
      app.querySelector("#page-title").value = current.title || "";
      app.querySelector("#page-text").value = current.text || "";
      app.querySelector("#page-color").value = current.color || "#16130f";
      app.querySelector("#page-ink").value = current.ink || "#f3ead8";
      app.querySelector("#page-size").value = String(current.size || 64);
      preview.innerHTML = stageHtml({ page: current, stage: state.campaign.stage });
      fit(preview);
      const mapHost = app.querySelector("#work-map");
      if (mapHost && mapHost._refresh && !mapHost.hidden) mapHost._refresh();
    }
    fill();
    window.addEventListener("resize", function () {
      fit(preview);
      const mapBoard = app.querySelector("#map-board");
      if (mapBoard) fit(mapBoard);
    });

    let timer = 0;
    function readForm() {
      const current = scenePage();
      current.title = app.querySelector("#page-title").value;
      current.text = app.querySelector("#page-text").value;
      current.color = app.querySelector("#page-color").value;
      current.ink = app.querySelector("#page-ink").value;
      current.size = Number(app.querySelector("#page-size").value) || 64;
      current.font = app.querySelector("#page-font").value;
      const chosenFont = shelf().fonts.find(function (item) { return fontStack(item.name) === current.font; });
      current.fontUrl = chosenFont ? chosenFont.url : "";
      current.image = app.querySelector("#page-pick").value;
      state.title = app.querySelector("#title").value;
      preview.innerHTML = stageHtml({ page: current, stage: state.campaign.stage });
      fit(preview);
    }
    async function save() {
      readForm();
      try {
        await api("/api/rooms/" + id + "/campaign", {
          method: "PUT",
          headers: headers,
          body: JSON.stringify({
            title: state.title,
            publishMode: state.publishMode,
            campaign: state.campaign
          })
        });
        app.querySelectorAll(".master .error").forEach(function (node) { node.textContent = ""; });
      } catch (error) {
        app.querySelectorAll(".master .error").forEach(function (node) { node.textContent = error.message; });
      }
    }
    function showModule(kind) {
      readForm();
      const target = kind === "map" ? window.ShirmoMap.ensure(state.campaign) : scenePage();
      state.campaign.activePageId = target.id;
      app.querySelector("#work-scene").hidden = kind === "map";
      const mapHost = app.querySelector("#work-map");
      mapHost.hidden = kind !== "map";
      app.querySelector("#mod-scene").classList.toggle("is-on", kind !== "map");
      app.querySelector("#mod-map").classList.toggle("is-on", kind === "map");
      if (kind === "map") {
        window.ShirmoMap.mount(mapHost, {
          page: target,
          campaign: state.campaign,
          library: shelf,
          fonts: function () {
            return FONTS.map(function (item) { return { name: item[0], font: item[1], url: "" }; }).concat(shelf().fonts.map(function (item) {
              return { name: item.name, font: fontStack(item.name), url: item.url };
            }));
          },
          save: save,
          ping: function (at, look) {
            return api("/api/rooms/" + id + "/events", {
              method: "POST",
              headers: headers,
              body: JSON.stringify({ type: "ping", x: at.x, y: at.y, look: look })
            });
          }
        });
      } else fill();
      save();
    }
    function schedule() {
      readForm();
      clearTimeout(timer);
      timer = setTimeout(save, 250);
    }
    ["title", "page-title", "page-text", "page-color", "page-ink", "page-size"].forEach(function (name) {
      app.querySelector("#" + name).addEventListener("input", schedule);
    });
    app.querySelector("#page-font").addEventListener("change", schedule);
    app.querySelector("#page-pick").addEventListener("change", schedule);
    app.querySelector("#page-note").addEventListener("change", function () {
      const note = shelf().notes.find(function (item) { return item.id === app.querySelector("#page-note").value; });
      if (!note) return;
      app.querySelector("#page-text").value = note.text || "";
      if (!app.querySelector("#page-title").value) app.querySelector("#page-title").value = note.name || "";
      schedule();
    });
    app.querySelector("#library").addEventListener("click", function () {
      openLibrary(id, key, shelf, save, fill, err);
    });
    app.querySelector("#mod-scene").addEventListener("click", function () { showModule("scene"); });
    app.querySelector("#mod-map").addEventListener("click", function () { showModule("map"); });

    function markMode() {
      app.querySelector("#mode-live").classList.toggle("is-on", state.publishMode === "live");
      app.querySelector("#mode-hold").classList.toggle("is-on", state.publishMode === "hold");
    }
    app.querySelector("#mode-live").addEventListener("click", function () {
      state.publishMode = "live";
      markMode();
      save();
    });
    app.querySelector("#mode-hold").addEventListener("click", function () {
      state.publishMode = "hold";
      markMode();
      save();
    });
    app.querySelector("#show").addEventListener("click", async function () {
      clearTimeout(timer);
      state.campaign.shownPageId = state.campaign.activePageId;
      await save();
      try {
        await api("/api/rooms/" + id + "/show", { method: "POST", headers: headers, body: "{}" });
      } catch (error) {
        err.textContent = error.message;
      }
    });
    state.rolls = state.rolls || [];
    state.pins = state.pins || [];
    app.querySelector("#roll").addEventListener("click", function () {
      openRolls(id, headers, state, err);
    });
    app.querySelector("#copy-master").addEventListener("click", function () {
      navigator.clipboard.writeText(location.origin + "/m/" + id + "?k=" + encodeURIComponent(key));
    });
    app.querySelector("#copy").addEventListener("click", function () {
      navigator.clipboard.writeText(viewerUrl);
    });
    if (page().kind === "map") showModule("map");
  }

  function filePick(id, accept, kind) {
    const icon = kind === "Изображение"
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8.5" cy="10" r="1.4" fill="currentColor"/><path d="M3 16l5-4 4 3 3-2 6 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10M9 16l3-10 3 10M10 13h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return '<label class="file-btn" title="' + kind + '">' +
      '<input id="' + id + '" type="file" accept="' + accept + '" aria-label="' + kind + '">' +
      icon + "</label>" +
      '<span class="file-name" id="' + id + '-name"></span>';
  }

  async function uploadFile(roomId, key, file) {
    const response = await fetch("/api/rooms/" + roomId + "/files", {
      method: "POST",
      headers: { authorization: "Bearer " + key, "content-type": file.type || "application/octet-stream" },
      body: file
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "ошибка");
    return data.url;
  }

  function openLibrary(roomId, key, shelf, save, fill, err) {
    const old = document.getElementById("pop");
    if (old) old.remove();
    const pop = document.createElement("div");
    pop.id = "pop";
    pop.className = "pop";
    document.body.appendChild(pop);
    function close() { pop.remove(); }
    function row(item, kind) {
      const thumb = kind === "images" && item.url ? '<img class="lib-thumb" alt="" src="' + esc(item.url) + '">' : "";
      return '<div class="lib-row">' + thumb + "<span>" + esc(item.name) + "</span>" +
        '<button type="button" data-del="' + kind + ":" + esc(item.id) + '">×</button></div>';
    }
    function paint() {
      const lib = shelf();
      pop.innerHTML = '<div class="pop-card" role="dialog" aria-label="Библиотека">' +
        '<div class="pop-head"><h2>Библиотека</h2><button type="button" data-pop-close>×</button></div>' +
        '<p class="note">Один раз кладёте сюда. На странице потом выбираете из меню.</p>' +
        '<section class="lib-block"><h3>Шрифты</h3>' +
        '<div class="lib-row"><input id="font-name" type="text" placeholder="Название">' + filePick("font-file", ".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf", "Шрифт") + "</div>" +
        '<button type="button" id="font-add">Добавить шрифт</button>' +
        (lib.fonts.map(function (item) { return row(item, "fonts"); }).join("") || '<p class="roll-empty">Пусто</p>') +
        "</section>" +
        '<section class="lib-block"><h3>Изображения</h3>' +
        '<div class="lib-row"><input id="image-name" type="text" placeholder="Название">' + filePick("image-file", "image/*", "Изображение") + "</div>" +
        '<button type="button" id="image-add">Добавить изображение</button>' +
        (lib.images.map(function (item) { return row(item, "images"); }).join("") || '<p class="roll-empty">Пусто</p>') +
        "</section>" +
        '<section class="lib-block"><h3>Заметки</h3>' +
        '<div class="lib-row"><input id="note-name" type="text" placeholder="Название"></div>' +
        '<textarea id="note-text" placeholder="Текст заметки"></textarea>' +
        '<button type="button" id="note-add">Добавить заметку</button>' +
        (lib.notes.map(function (item) { return row(item, "notes"); }).join("") || '<p class="roll-empty">Пусто</p>') +
        "</section></div>";
      pop.querySelector("[data-pop-close]").addEventListener("click", close);
      pop.querySelectorAll("input[type=file]").forEach(function (input) {
        input.addEventListener("change", function () {
          const file = input.files[0];
          const slot = pop.querySelector("#" + input.id + "-name");
          if (slot) slot.textContent = file ? file.name : "";
          const title = pop.querySelector("#" + input.id.replace("-file", "-name"));
          if (title && file) title.value = file.name.replace(/\.[^.]+$/, "");
        });
      });
      pop.querySelectorAll("[data-del]").forEach(function (button) {
        button.addEventListener("click", function () {
          const bits = button.getAttribute("data-del").split(":");
          const lib = shelf();
          lib[bits[0]] = lib[bits[0]].filter(function (item) { return item.id !== bits[1]; });
          save();
          fill();
          paint();
        });
      });
      pop.querySelector("#font-add").addEventListener("click", async function () {
        const file = pop.querySelector("#font-file").files[0];
        const name = pop.querySelector("#font-name").value.trim();
        if (!file || !name) return;
        try {
          const url = await uploadFile(roomId, key, file);
          shelf().fonts.push({ id: crypto.randomUUID(), name: name, url: url });
          await save();
          fill();
          paint();
        } catch (error) {
          err.textContent = error.message;
        }
      });
      pop.querySelector("#image-add").addEventListener("click", async function () {
        const file = pop.querySelector("#image-file").files[0];
        const name = pop.querySelector("#image-name").value.trim();
        if (!file || !name) return;
        try {
          const url = await uploadFile(roomId, key, file);
          shelf().images.push({ id: crypto.randomUUID(), name: name, url: url });
          await save();
          fill();
          paint();
        } catch (error) {
          err.textContent = error.message;
        }
      });
      pop.querySelector("#note-add").addEventListener("click", async function () {
        const name = pop.querySelector("#note-name").value.trim();
        const text = pop.querySelector("#note-text").value;
        if (!name) return;
        shelf().notes.push({ id: crypto.randomUUID(), name: name, text: text });
        await save();
        fill();
        paint();
      });
    }
    pop.addEventListener("click", function (event) { if (event.target === pop) close(); });
    paint();
  }

  if (masterMatch) master(decodeURIComponent(masterMatch[1]));
  else if (viewerMatch) viewer(decodeURIComponent(viewerMatch[1]));
  else home();
})();
