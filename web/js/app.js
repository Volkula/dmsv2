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

  (function () {
    let host = null;
    let box = null;
    let timer = 0;
    let pending = null;
    function restore() {
      if (host && Object.prototype.hasOwnProperty.call(host.dataset, "tipHold")) {
        host.setAttribute("title", host.dataset.tipHold);
        delete host.dataset.tipHold;
      }
      host = null;
    }
    function clearBox() {
      restore();
      if (box) box.remove();
      box = null;
    }
    function hide() {
      clearTimeout(timer);
      timer = 0;
      pending = null;
      clearBox();
    }
    function show(next, text) {
      clearBox();
      next.dataset.tipHold = text;
      next.removeAttribute("title");
      host = next;
      box = document.createElement("div");
      box.className = "hover-tip";
      box.setAttribute("role", "tooltip");
      box.textContent = text;
      document.body.appendChild(box);
      const rect = next.getBoundingClientRect();
      let left = Math.max(8, Math.min(rect.left, window.innerWidth - box.offsetWidth - 8));
      let top = rect.bottom + 6;
      if (top + box.offsetHeight > window.innerHeight - 8) top = Math.max(8, rect.top - box.offsetHeight - 6);
      box.style.left = left + "px";
      box.style.top = top + "px";
    }
    document.addEventListener("pointerover", function (event) {
      const target = event.target;
      if (!target || !target.closest) return;
      const next = target.closest("[title], [data-tip-hold]");
      if (!next || next.closest(".tool-wheel") || next === host) return;
      const text = next.getAttribute("title") || next.dataset.tipHold || "";
      if (!text.trim()) return;
      pending = next;
      clearTimeout(timer);
      timer = setTimeout(function () {
        pending = null;
        if (!next.isConnected) return hide();
        show(next, text);
      }, 280);
    });
    document.addEventListener("pointerout", function (event) {
      const to = event.relatedTarget;
      const next = to && to.closest ? to.closest("[title], [data-tip-hold]") : null;
      if (host && to && (host === to || host.contains(to) || next === host)) return;
      if (host) clearBox();
      if (pending && next !== pending) {
        clearTimeout(timer);
        timer = 0;
        pending = null;
      }
    });
    document.addEventListener("pointerdown", hide);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
  })();

  function home() {
    app.innerHTML = '<section class="gate"><form class="card" id="create">' +
      "<h1>Ширма</h1>" +
      '<p class="note">Комната на этом сервере. Мастер получает ссылку для правки, игроки — ссылку на экран.</p>' +
      '<label title="Имя новой комнаты">Название<input name="title" value="Новая комната" required></label>' +
      '<div class="row"><button class="primary" type="submit" title="Открыть комнату и перейти к ширме">Создать комнату</button></div>' +
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

  function showDie(roll, onClose) {
    if (!roll || !window.ShirmoDice) return;
    const old = document.querySelector(".die-show");
    if (old) old.remove();
    const show = document.createElement("div");
    show.className = "die-show";
    const check = roll.label || "";
    const name = roll.name || "";
    show.innerHTML = '<div class="die-frame">' +
      (check ? '<p class="die-check">' + esc(check) + "</p>" : "") +
      '<b class="die-total">' + esc(String(roll.total)) + "</b>" +
      '<div class="die-hole"></div>' +
      (name ? '<p class="die-name">' + esc(name) + "</p>" : "") +
      '</div><canvas class="die-flight"></canvas>';
    document.body.appendChild(show);
    const canvas = show.querySelector("canvas");
    const box = show.getBoundingClientRect();
    const hole = show.querySelector(".die-hole").getBoundingClientRect();
    const focusY = box.height ? (hole.top + hole.height / 2 - box.top) / box.height : 0.56;
    window.ShirmoDice.show(canvas, Object.assign({}, roll, { focusY: focusY }), {
      width: Math.max(1, Math.round(box.width)),
      height: Math.max(1, Math.round(box.height))
    });
    show.addEventListener("click", function (event) {
      if (event.target.closest(".die-frame")) return;
      show.remove();
      if (onClose) onClose();
    });
  }

  function showBoard(title, goods, onClose) {
    const old = document.querySelector(".board-show");
    if (old) old.remove();
    const show = document.createElement("div");
    show.className = "board-show";
    const rows = (goods || []).map(function (item) {
      const icon = item.icon ? '<img alt="" src="' + esc(item.icon) + '">' : "";
      return "<li>" + icon + "<span>" + esc(item.name || "Предмет") + "</span><em>" + esc(item.price || "") + "</em></li>";
    }).join("");
    show.innerHTML = '<div class="board-card" role="dialog" aria-label="' + esc(title || "Товары") + '"><h2>' + esc(title || "Товары") + "</h2><ul>" +
      (rows || '<li class="note">Пусто</li>') + "</ul></div>";
    document.body.appendChild(show);
    show.addEventListener("click", function (event) {
      if (event.target.closest(".board-card")) return;
      show.remove();
      if (onClose) onClose();
    });
  }

  function publishGoods(roomId, headers, goods) {
    const list = (goods || []).slice(0, 40).map(function (item) {
      return { name: item.name || "", price: item.price || "", icon: item.icon || "" };
    }).filter(function (item) { return String(item.name).trim(); });
    showBoard("Товары", list, function () { hidePlayerGoods(roomId, headers); });
    return api("/api/rooms/" + roomId + "/events", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ type: "wares", text: "Товары", goods: list })
    });
  }

  function hidePlayerGoods(roomId, headers) {
    const shown = document.querySelector(".board-show");
    if (shown) shown.remove();
    return api("/api/rooms/" + roomId + "/events", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ type: "wares-hide" })
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
      if (event && event.type === "die-hide") {
        const shown = document.querySelector(".die-show");
        if (shown) shown.remove();
        return;
      }
      if (event && event.type === "wares-hide") {
        const board = document.querySelector(".board-show");
        if (board) board.remove();
        return;
      }
      if (event && event.type === "die" && event.roll) {
        showDie(event.roll);
        return;
      }
      if (event && event.type === "wares") {
        showBoard(event.text || "Товары", event.goods || []);
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
      const other = mode === "advantage" ? "disadvantage" : "advantage";
      const aKeep = a === b ? "" : (mode === "advantage" ? a > b : a < b) ? mode : other;
      const bKeep = a === b ? "" : aKeep === mode ? other : mode;
      return {
        name: spec.name || "",
        count: 2,
        sides: 20,
        mode: mode,
        total: total,
        dice: [
          { sides: 20, value: a, tint: aKeep },
          { sides: 20, value: b, tint: bKeep }
        ],
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
      dice: dice.map(function (value) { return { sides: sides, value: value }; }),
      log: count === 1 ? String(total) : dice.join("+") + "=" + total,
      label: count + "d" + sides
    };
  }

  function rollText(roll) {
    const title = roll.name ? roll.name + ": " : "";
    return title + (roll.label ? roll.label + " " : "") + roll.log;
  }

  function diceLook(state) {
    const look = (state.campaign && state.campaign.dice) || {};
    const speed = Number(look.speed);
    return {
      speed: Number.isFinite(speed) ? Math.min(2.5, Math.max(0.4, speed)) : 1,
      animate: look.animate !== false,
      color: /^#[0-9a-f]{6}$/i.test(look.color || "") ? look.color : "#c4a574",
      texture: typeof look.texture === "string" ? look.texture : ""
    };
  }

  function openRollMenu(roomId, headers, state, err, anchor) {
    const old = document.getElementById("roll-menu");
    if (old) {
      if (old._close) old._close();
      else old.remove();
      return;
    }
    const menu = document.createElement("div");
    menu.id = "roll-menu";
    menu.className = "roll-menu";
    const box = anchor.getBoundingClientRect();
    menu.style.top = (box.bottom + 6) + "px";
    menu.style.left = Math.max(8, box.left) + "px";
    let sides = 20;
    function pinButtons() {
      if (!state.pins.length) return '<p class="note">Пока нет закреплённых.</p>';
      return state.pins.map(function (pin) {
        const formula = pin.mode === "advantage" ? "преимущество" : pin.mode === "disadvantage" ? "помеха" : (pin.count || 1) + "d" + (pin.sides || 20);
        return '<div class="pin-line"><button type="button" data-pin="' + esc(pin.id) + '">' + esc(pin.name || "Бросок") + " — " + esc(formula) + "</button>" +
          '<button type="button" data-unpin="' + esc(pin.id) + '" title="Убрать из закреплённых">×</button></div>';
      }).join("");
    }
    function setupHtml() {
      const dice = [4, 6, 8, 10, 12, 20, 100].map(function (n) {
        return '<button type="button" data-sides="' + n + '"' + (n === sides ? ' class="is-on"' : "") + ">d" + n + "</button>";
      }).join("");
      return '<div class="roll-setup"><label title="Имя закреплённой формулы">Название <input id="die-name" type="text" placeholder="Атака мечом"></label>' +
        '<label title="Сколько костей">Сколько <input id="die-count" type="number" min="1" max="12" value="1"></label>' +
        '<div class="die-sides">' + dice + "</div>" +
        '<label class="check" title="Два броска, берётся больший"><input id="die-adv" type="checkbox"> С преимуществом</label>' +
        '<label class="check" title="Два броска, берётся меньший"><input id="die-dis" type="checkbox"> С помехой</label>' +
        '<div class="row"><button type="button" data-roll="throw-custom">Бросить</button>' +
        '<button type="button" data-roll="save-pin">Закрепить</button></div></div>';
    }
    function historyRows() {
      if (!state.rolls.length) return '<p class="note">Пока пусто</p>';
      return state.rolls.map(function (roll) {
        const when = new Date(roll.at).toLocaleString("ru");
        return '<p class="note">' + esc(when) + " — " + esc(roll.text) + "</p>";
      }).join("");
    }
    menu.innerHTML = '<button type="button" data-roll="advantage">Бросить с преимуществом</button>' +
      '<button type="button" data-roll="disadvantage">Бросить с помехой</button>' +
      '<button type="button" data-roll="pins">Закреплённые</button>' +
      '<div class="roll-fly" data-fly="pins" hidden><div data-pin-list>' + pinButtons() + "</div>" + setupHtml() + "</div>" +
      '<button type="button" data-roll="history">История</button>' +
      '<div class="roll-fly" data-fly="history" hidden>' + historyRows() + "</div>";
    document.body.appendChild(menu);
    async function throwSpec(spec) {
      const look = diceLook(state);
      const roll = rollFormula(spec);
      roll.color = spec.color || look.color;
      roll.texture = spec.texture || look.texture;
      roll.speed = look.speed;
      roll.animate = look.animate;
      try {
        const data = await api("/api/rooms/" + roomId + "/events", {
          method: "POST",
          headers: headers,
          body: JSON.stringify({ type: "die", text: rollText(roll), roll: roll })
        });
        state.rolls = data.rolls || state.rolls;
        err.textContent = "";
        showDie((data.event && data.event.roll) || roll, function () {
          api("/api/rooms/" + roomId + "/events", {
            method: "POST",
            headers: headers,
            body: JSON.stringify({ type: "die-hide" })
          }).catch(function () {});
        });
        closeMenu();
      } catch (error) {
        err.textContent = error.message;
      }
    }
    function currentSpec() {
      const adv = menu.querySelector("#die-adv");
      const dis = menu.querySelector("#die-dis");
      const mode = adv && adv.checked ? "advantage" : dis && dis.checked ? "disadvantage" : "normal";
      return {
        name: (menu.querySelector("#die-name").value || "").trim(),
        count: Number(menu.querySelector("#die-count").value) || 1,
        sides: sides,
        mode: mode
      };
    }
    const advBox = menu.querySelector("#die-adv");
    const disBox = menu.querySelector("#die-dis");
    advBox.addEventListener("change", function () { if (advBox.checked) disBox.checked = false; });
    disBox.addEventListener("change", function () { if (disBox.checked) advBox.checked = false; });
    async function savePin(spec) {
      try {
        const data = await api("/api/rooms/" + roomId + "/pins", {
          method: "POST",
          headers: headers,
          body: JSON.stringify(spec)
        });
        state.pins = data.pins || [];
        menu.querySelector("[data-pin-list]").innerHTML = pinButtons();
        err.textContent = "";
      } catch (error) {
        err.textContent = error.message;
      }
    }
    async function unpin(pinId) {
      try {
        const data = await api("/api/rooms/" + roomId + "/pins/" + pinId, {
          method: "DELETE",
          headers: headers
        });
        state.pins = data.pins || [];
        menu.querySelector("[data-pin-list]").innerHTML = pinButtons();
        err.textContent = "";
      } catch (error) {
        err.textContent = error.message;
      }
    }
    menu.addEventListener("click", function (event) {
      const button = event.target.closest("button");
      if (!button || !menu.contains(button)) return;
      if (button.hasAttribute("data-sides")) {
        sides = Number(button.getAttribute("data-sides"));
        menu.querySelectorAll("[data-sides]").forEach(function (node) {
          node.classList.toggle("is-on", node === button);
        });
        return;
      }
      const kind = button.getAttribute("data-roll");
      if (kind === "advantage" || kind === "disadvantage") {
        throwSpec({ mode: kind });
        return;
      }
      if (kind === "save-pin") {
        savePin(currentSpec());
        return;
      }
      if (kind === "throw-custom") {
        throwSpec(currentSpec());
        return;
      }
      if (button.hasAttribute("data-unpin")) {
        unpin(button.getAttribute("data-unpin"));
        return;
      }
      if (kind === "pins" || kind === "history") {
        const fly = menu.querySelector('[data-fly="' + kind + '"]');
        const open = fly.hidden;
        menu.querySelectorAll(".roll-fly").forEach(function (node) { node.hidden = true; });
        fly.hidden = !open;
        return;
      }
      const pin = state.pins.find(function (item) { return item.id === button.getAttribute("data-pin"); });
      if (pin) throwSpec(pin);
    });
    function closeMenu() {
      menu.remove();
      document.removeEventListener("click", away);
    }
    menu._close = closeMenu;
    function away(event) {
      if (event.target.closest("#roll-menu") || event.target.closest("#roll")) return;
      closeMenu();
    }
    setTimeout(function () { document.addEventListener("click", away); }, 0);
  }

  function openRollLook(state, err, save, anchor) {
    const old = document.getElementById("roll-look-menu");
    if (old) {
      if (old._close) old._close();
      else old.remove();
      return;
    }
    const menu = document.getElementById("roll-menu");
    if (menu && menu._close) menu._close();
    const look = diceLook(state);
    const images = ((state.campaign.library || {}).images) || [];
    const tex = '<option value="">Без текстуры</option>' + images.map(function (item) {
      const url = item.url || "";
      return '<option value="' + esc(url) + '"' + (url === look.texture ? " selected" : "") + ">" + esc(item.name || "Картинка") + "</option>";
    }).join("");
    const pop = document.createElement("div");
    pop.id = "roll-look-menu";
    pop.className = "roll-menu";
    const box = anchor.getBoundingClientRect();
    pop.style.top = (box.bottom + 6) + "px";
    pop.style.left = Math.max(8, box.left) + "px";
    pop.innerHTML = '<label title="Как быстро кубик доезжает до центра">Скорость <input id="die-speed" type="range" min="0.4" max="2.5" step="0.1" value="' + look.speed + '"></label>' +
      '<span id="die-speed-n">' + look.speed.toFixed(1) + "</span>" +
      '<label class="check" title="Сразу карточка с итогом, без проката"><input id="die-still" type="checkbox"' + (look.animate ? "" : " checked") + "> Без анимации</label>" +
      '<label title="Цвет кубика для всех бросков">Цвет <input id="die-look-color" type="color" value="' + look.color + '"></label>' +
      '<label title="Картинка на гранях. Берётся из библиотеки">Текстура <select id="die-look-tex">' + tex + "</select></label>";
    document.body.appendChild(pop);
    function writeLook() {
      state.campaign.dice = {
        speed: Number(pop.querySelector("#die-speed").value) || 1,
        animate: !pop.querySelector("#die-still").checked,
        color: pop.querySelector("#die-look-color").value,
        texture: pop.querySelector("#die-look-tex").value
      };
      pop.querySelector("#die-speed-n").textContent = state.campaign.dice.speed.toFixed(1);
      if (save) save();
      if (err) err.textContent = "";
    }
    pop.querySelector("#die-speed").addEventListener("input", writeLook);
    pop.querySelector("#die-still").addEventListener("change", writeLook);
    pop.querySelector("#die-look-color").addEventListener("input", writeLook);
    pop.querySelector("#die-look-tex").addEventListener("change", writeLook);
    function closeLook() {
      pop.remove();
      document.removeEventListener("click", away);
    }
    pop._close = closeLook;
    function away(event) {
      if (event.target.closest("#roll-look-menu") || event.target.closest("#roll-look")) return;
      closeLook();
    }
    setTimeout(function () { document.addEventListener("click", away); }, 0);
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
      '<input id="title" type="text" value="' + esc(state.title) + '" aria-label="Название комнаты" title="Название комнаты">' +
      '<button type="button" id="mode-live" class="' + (state.publishMode === "live" ? "is-on" : "") + '" title="Правки открытой страницы сразу видны игрокам">Сразу</button>' +
      '<button type="button" id="mode-hold" class="' + (state.publishMode === "hold" ? "is-on" : "") + '" title="Игроки видят кадр, когда нажмёте «Показать»">Только по кнопке</button>' +
      '<button type="button" class="primary" id="show" title="Отправить игрокам то, что на экране сейчас">Показать</button>' +
      '<button type="button" id="roll" title="Бросок с преимуществом или помехой, закреплённые и история">Броски</button>' +
      '<button type="button" id="roll-look" title="Скорость, цвет и текстура кубика">Кубик</button>' +
      '<button type="button" id="library" title="Шрифты, картинки и заметки комнаты">Библиотека</button>' +
      '<button type="button" id="mod-scene" class="is-on" title="Страница с текстом и фоном">Сцена</button>' +
      '<button type="button" id="mod-map" title="Карта и локации">Карта</button>' +
      '<button type="button" id="mod-codex" title="Персонажи, отряды и каталог">Справочник</button>' +
      '<span class="spacer"></span>' +
      '<button type="button" id="copy-master" title="Скопировать ссылку с ключом мастера">Ссылка мастера</button>' +
      '<button type="button" id="copy" title="Скопировать ссылку для зрителей">Ссылка игроков</button>' +
      '<a href="' + esc(viewerUrl) + '" target="_blank" rel="noopener" title="Открыть экран игроков в новой вкладке">Открыть экран</a>' +
      "</div><div class=\"work\" id=\"work-scene\"><aside class=\"side\">" +
      '<label title="Крупная строка на сцене">Заголовок<input id="page-title" type="text"></label>' +
      '<label title="Текст под заголовком">Текст<textarea id="page-text"></textarea></label>' +
      '<label title="Цвет фона сцены">Фон<input id="page-color" type="color"></label>' +
      '<label title="Цвет букв на сцене">Цвет текста<input id="page-ink" type="color"></label>' +
      '<label title="Размер заголовка">Размер <input id="page-size" type="range" min="24" max="140" value="64"></label>' +
      '<label title="Шрифт сцены">Шрифт<select id="page-font"></select></label>' +
      '<label title="Картинка из библиотеки на фон">Картинка<select id="page-pick"></select></label>' +
      '<label title="Текст заметки вместо своего текста">Заметка<select id="page-note"></select></label>' +
      '<p class="note">В режиме «Сразу» правки этой страницы уходят игрокам сами. «Показать» публикует кадр в любом режиме. Бросок виден игрокам карточкой с кубиком и остаётся в истории.</p>' +
      '<p class="error" id="err"></p></aside>' +
      '<div class="stage-wrap" id="preview"></div></div><div class="work" id="work-map" hidden></div><div class="work" id="work-codex" hidden></div></section>';

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
        const npcs = (state.campaign.codex && state.campaign.codex.npcs) || [];
        const section = window.ShirmoLib ? window.ShirmoLib.title(item, npcs) : "";
        const label = section && section !== "Общее" ? section + " — " + item.name : item.name;
        return '<option value="' + esc(item.url) + '">' + esc(label) + "</option>";
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
      const mapHost = app.querySelector("#work-map");
      const codexHost = app.querySelector("#work-codex");
      if (kind !== "codex" && codexHost._codexFlush) codexHost._codexFlush();
      app.querySelector("#work-scene").hidden = kind !== "scene";
      mapHost.hidden = kind !== "map";
      codexHost.hidden = kind !== "codex";
      app.querySelector("#mod-scene").classList.toggle("is-on", kind === "scene");
      app.querySelector("#mod-map").classList.toggle("is-on", kind === "map");
      app.querySelector("#mod-codex").classList.toggle("is-on", kind === "codex");
      if (kind === "codex") {
        window.ShirmoCodex.mount(codexHost, {
          campaign: state.campaign,
          save: save,
          upload: function (file) { return uploadFile(id, key, file); },
          showGoods: function (goods) { return publishGoods(id, headers, goods); }
        });
        return;
      }
      const target = kind === "map" ? window.ShirmoMap.ensure(state.campaign) : scenePage();
      state.campaign.activePageId = target.id;
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
          upload: function (file) { return uploadFile(id, key, file); },
          showGoods: function (goods) { return publishGoods(id, headers, goods); },
          hideGoods: function () { return hidePlayerGoods(id, headers); },
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
      openLibrary(id, key, shelf, save, fill, err, function (image) {
        const npcs = (state.campaign.codex && state.campaign.codex.npcs) || [];
        return window.ShirmoLib ? window.ShirmoLib.title(image, npcs) : "Общее";
      });
    });
    app.querySelector("#mod-scene").addEventListener("click", function () { showModule("scene"); });
    app.querySelector("#mod-map").addEventListener("click", function () { showModule("map"); });
    app.querySelector("#mod-codex").addEventListener("click", function () { showModule("codex"); });

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
      const look = document.getElementById("roll-look-menu");
      if (look && look._close) look._close();
      openRollMenu(id, headers, state, err, app.querySelector("#roll"));
    });
    app.querySelector("#roll-look").addEventListener("click", function () {
      openRollLook(state, err, save, app.querySelector("#roll-look"));
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
    const tip = kind === "Изображение" ? "Загрузить картинку в библиотеку" : "Загрузить файл шрифта";
    return '<label class="file-btn" title="' + tip + '">' +
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

  function openLibrary(roomId, key, shelf, save, fill, err, sectionOf) {
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
        '<button type="button" data-del="' + kind + ":" + esc(item.id) + '" title="Убрать из библиотеки">×</button></div>';
    }
    function imageBlocks(images) {
      const groups = [];
      const index = {};
      (images || []).forEach(function (item) {
        const name = sectionOf ? sectionOf(item) : (item.section || "Общее");
        if (!index[name]) {
          index[name] = [];
          groups.push(name);
        }
        index[name].push(item);
      });
      groups.sort(function (a, b) {
        function rank(name) {
          if (name === "Общее") return 2;
          if (name === "Иконки товаров") return 1;
          return 0;
        }
        const gap = rank(a) - rank(b);
        return gap || a.localeCompare(b, "ru");
      });
      if (!groups.length) return '<p class="roll-empty">Пусто</p>';
      return groups.map(function (name) {
        return '<h4 class="lib-section">' + esc(name) + "</h4>" + index[name].map(function (item) { return row(item, "images"); }).join("");
      }).join("");
    }
    function paint() {
      const lib = shelf();
      pop.innerHTML = '<div class="pop-card" role="dialog" aria-label="Библиотека">' +
        '<div class="pop-head"><h2>Библиотека</h2><button type="button" data-pop-close title="Закрыть">×</button></div>' +
        '<p class="note">Один раз кладёте сюда. На странице потом выбираете из меню. Загрузки персонажа сами попадают в его раздел.</p>' +
        '<section class="lib-block"><h3>Шрифты</h3>' +
        '<div class="lib-row"><input id="font-name" type="text" placeholder="Название" title="Как шрифт будет называться в списках">' + filePick("font-file", ".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf", "Шрифт") + "</div>" +
        '<button type="button" id="font-add" title="Сохранить шрифт в библиотеке">Добавить шрифт</button>' +
        (lib.fonts.map(function (item) { return row(item, "fonts"); }).join("") || '<p class="roll-empty">Пусто</p>') +
        "</section>" +
        '<section class="lib-block"><h3>Изображения</h3>' +
        '<div class="lib-row"><input id="image-name" type="text" placeholder="Название" title="Как картинка будет называться в списках">' + filePick("image-file", "image/*", "Изображение") + "</div>" +
        '<button type="button" id="image-add" title="Сохранить картинку в библиотеке">Добавить изображение</button>' +
        imageBlocks(lib.images) +
        "</section>" +
        '<section class="lib-block"><h3>Заметки</h3>' +
        '<div class="lib-row"><input id="note-name" type="text" placeholder="Название" title="Как заметка будет называться в списках"></div>' +
        '<textarea id="note-text" placeholder="Текст заметки" title="Текст, который можно выбрать на сцене"></textarea>' +
        '<button type="button" id="note-add" title="Сохранить заметку в библиотеке">Добавить заметку</button>' +
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

  let popLayer = 30;
  function armPop(pop) {
    if (!pop || !pop.classList || !pop.classList.contains("pop")) return;
    const card = pop.querySelector(":scope > .pop-card");
    if (!card || card.dataset.fit === "1") return;
    if (!pop._box) {
      const rect = card.getBoundingClientRect();
      pop._box = {
        x: Math.max(8, rect.left),
        y: Math.max(8, rect.top),
        w: Math.max(280, Math.round(rect.width)),
        h: Math.max(160, Math.round(Math.min(rect.height, window.innerHeight - 16)))
      };
    } else if (!pop._sized) {
      const cap = window.innerHeight - 16;
      const natural = Math.round(card.scrollHeight);
      if (natural > pop._box.h && pop._box.h < cap) pop._box.h = Math.min(cap, natural);
    }
    const head = card.querySelector(".pop-head");
    const body = document.createElement("div");
    body.className = "pop-body";
    while (card.firstChild) body.appendChild(card.firstChild);
    if (head) card.appendChild(head);
    card.appendChild(body);
    const grip = document.createElement("span");
    grip.className = "pop-resize";
    grip.title = "Потяните, чтобы изменить размер";
    card.appendChild(grip);
    card.dataset.fit = "1";
    pop.classList.add("is-free");
    card.style.left = pop._box.x + "px";
    card.style.top = pop._box.y + "px";
    card.style.width = pop._box.w + "px";
    card.style.height = pop._box.h + "px";
    if (head) {
      head.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) return;
        if (event.target.closest("button, input, select, textarea, a, label")) return;
        pop.style.zIndex = String(++popLayer);
        const startX = event.clientX;
        const startY = event.clientY;
        const originX = pop._box.x;
        const originY = pop._box.y;
        let moved = false;
        function move(ev) {
          if (ev.pointerId !== event.pointerId) return;
          if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 3) moved = true;
          pop._box.x = Math.min(window.innerWidth - 48, Math.max(-pop._box.w + 80, originX + ev.clientX - startX));
          pop._box.y = Math.min(window.innerHeight - 48, Math.max(0, originY + ev.clientY - startY));
          card.style.left = pop._box.x + "px";
          card.style.top = pop._box.y + "px";
        }
        function up(ev) {
          if (ev.pointerId !== event.pointerId) return;
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
          if (!moved) return;
          window.addEventListener("click", function stop(click) {
            click.preventDefault();
            click.stopPropagation();
            window.removeEventListener("click", stop, true);
          }, true);
        }
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
        try { head.setPointerCapture(event.pointerId); } catch (e) {}
      });
    }
    grip.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startY = event.clientY;
      const originW = pop._box.w;
      const originH = pop._box.h;
      let moved = false;
      function move(ev) {
        if (ev.pointerId !== event.pointerId) return;
        if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 3) moved = true;
        pop._sized = true;
        pop._box.w = Math.max(280, Math.min(window.innerWidth - 16, originW + ev.clientX - startX));
        pop._box.h = Math.max(160, Math.min(window.innerHeight - 16, originH + ev.clientY - startY));
        card.style.width = pop._box.w + "px";
        card.style.height = pop._box.h + "px";
      }
      function up(ev) {
        if (ev.pointerId !== event.pointerId) return;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        if (!moved) return;
        window.addEventListener("click", function stop(click) {
          click.preventDefault();
          click.stopPropagation();
          window.removeEventListener("click", stop, true);
        }, true);
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      try { grip.setPointerCapture(event.pointerId); } catch (e) {}
    });
  }
  new MutationObserver(function (records) {
    records.forEach(function (record) {
      record.addedNodes.forEach(function (node) {
        if (!node || node.nodeType !== 1) return;
        if (node.classList.contains("pop")) armPop(node);
        if (node.classList.contains("pop-card") && node.parentElement) armPop(node.parentElement);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });

  if (masterMatch) master(decodeURIComponent(masterMatch[1]));
  else if (viewerMatch) viewer(decodeURIComponent(viewerMatch[1]));
  else home();
})();
