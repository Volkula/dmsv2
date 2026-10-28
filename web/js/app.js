(function () {
  const app = document.getElementById("app");
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const masterMatch = path.match(/^\/m\/([^/]+)$/);
  const viewerMatch = path.match(/^\/v\/([^/]+)$/);
  const isAdminPage = path === "/admin";
  const ADMIN_KEY = "shirmo-admin";

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

  const SHELF = "shirmo-rooms";

  function readShelf() {
    try {
      const list = JSON.parse(localStorage.getItem(SHELF) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  }

  function rememberRoom(room) {
    if (!room || !room.id || !room.key) return;
    const prev = readShelf().find(function (item) { return item.id === room.id; });
    const list = readShelf().filter(function (item) { return item.id !== room.id; });
    list.unshift({
      id: room.id,
      title: String(room.title || (prev && prev.title) || "Комната").slice(0, 80),
      key: room.key,
      at: Date.now()
    });
    localStorage.setItem(SHELF, JSON.stringify(list.slice(0, 40)));
  }

  function shelfKey(id) {
    const found = readShelf().find(function (item) { return item.id === id; });
    return found && found.key || "";
  }

  function takeKey(id) {
    const query = new URLSearchParams(location.search);
    const fromUrl = query.get("k");
    const key = fromUrl || sessionStorage.getItem(keyName(id)) || shelfKey(id) || "";
    if (fromUrl) history.replaceState(null, "", location.pathname);
    if (key) {
      sessionStorage.setItem(keyName(id), key);
      rememberRoom({ id: id, key: key });
    }
    return key;
  }

  function whenText(stamp) {
    const date = new Date(Number(stamp) || 0);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return "";
    return date.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  async function api(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || "ошибка");
    return data;
  }

  function formatBytes(n) {
    const v = Number(n) || 0;
    if (v < 1024) return v + " B";
    if (v < 1048576) return (v / 1024).toFixed(1) + " KB";
    if (v < 1073741824) return (v / 1048576).toFixed(1) + " MB";
    return (v / 1073741824).toFixed(2) + " GB";
  }

  function backupToast(text, kind) {
    let el = document.getElementById("backup-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "backup-toast";
      el.className = "backup-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.className = "backup-toast" + (kind ? " is-" + kind : "");
    el.textContent = text || "";
    el.hidden = !text;
  }

  async function downloadBackup(url, headers) {
    backupToast("Собираю выгрузку…", "busy");
    const response = await fetch(url, { headers: headers });
    if (!response.ok) {
      const data = await response.json().catch(function () { return {}; });
      throw new Error(data.error || "ошибка выгрузки");
    }
    const total = Number(response.headers.get("content-length")) || 0;
    const reader = response.body && response.body.getReader ? response.body.getReader() : null;
    let blob;
    if (!reader) {
      backupToast("Скачиваю…", "busy");
      blob = await response.blob();
    } else {
      const chunks = [];
      let received = 0;
      let lastPaint = 0;
      while (true) {
        const step = await reader.read();
        if (step.done) break;
        chunks.push(step.value);
        received += step.value.byteLength;
        if (received - lastPaint > 256 * 1024 || !chunks.length) {
          lastPaint = received;
          backupToast(total
            ? "Выгрузка: " + formatBytes(received) + " / " + formatBytes(total)
            : "Выгрузка: " + formatBytes(received) + "…", "busy");
        }
      }
      blob = new Blob(chunks, { type: "application/json" });
    }
    const cd = response.headers.get("content-disposition") || "";
    const match = /filename="([^"]+)"/.exec(cd);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = match ? match[1] : "room.shirmo.json";
    link.click();
    URL.revokeObjectURL(link.href);
    backupToast("Готово: " + formatBytes(blob.size), "ok");
    setTimeout(function () { backupToast(""); }, 2800);
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
    if (page.kind === "battle" && window.ShirmoBattle) return window.ShirmoBattle.playerHtml(page);
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

  function askPass(label) {
    const value = window.prompt(label || "Пароль мастера");
    return value == null ? "" : String(value);
  }

  function home() {
    app.innerHTML = '<section class="gate"><div class="gate-stack" id="home-stack">' +
      '<p class="note">Загрузка…</p></div></section>';
    paintHome();
  }

  async function paintHome() {
    let publicCreate = true;
    try {
      const meta = await api("/api/meta");
      publicCreate = meta.publicCreate !== false;
    } catch (err) { /* старый api */ }
    const stack = app.querySelector("#home-stack");
    if (!stack) return;
    // Загрузка выгрузки — только у админа. Выгрузка — в комнате или у админа.
    const createCard = publicCreate
      ? '<form class="card" id="create">' +
        "<h1>Ширма</h1>" +
        '<p class="note">Пароль мастера нужен для входа и удаления. Его можно сохранить в браузере.</p>' +
        '<label title="Имя новой комнаты">Название<input name="title" value="Новая комната" required></label>' +
        '<label title="Пароль мастера">Пароль<input name="password" type="password" minlength="4" required autocomplete="new-password"></label>' +
        '<div class="row"><button class="primary" type="submit">Создать комнату</button></div>' +
        '<p class="error" id="err"></p></form>'
      : '<div class="card"><h1>Ширма</h1><p class="note">Публичное создание комнат выключено. Новые комнаты и загрузка выгрузок — в /admin.</p></div>';
    stack.innerHTML = createCard +
      '<section class="card" id="shelf"><h2>Комнаты</h2><p class="note">Загрузка…</p></section>';
    const create = app.querySelector("#create");
    if (create) create.addEventListener("submit", async function (event) {
      event.preventDefault();
      const form = new FormData(event.target);
      try {
        const room = await api("/api/rooms", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: form.get("title"), password: form.get("password") })
        });
        rememberRoom({ id: room.id, title: room.title, key: room.masterKey });
        sessionStorage.setItem(keyName(room.id), room.masterKey);
        location.href = "/m/" + room.id;
      } catch (err) {
        app.querySelector("#err").textContent = err.message;
      }
    });
    fillShelf();
  }

  function adminHeaders() {
    const token = sessionStorage.getItem(ADMIN_KEY) || "";
    return { authorization: "Bearer " + token, "content-type": "application/json" };
  }

  async function admin() {
    const token = sessionStorage.getItem(ADMIN_KEY) || "";
    if (!token) {
      app.innerHTML = '<section class="gate"><form class="card" id="admin-login"><h1>Админ</h1>' +
        '<p class="note">Глобальный пароль из окружения сервера.</p>' +
        '<label>Пароль<input name="password" type="password" minlength="1" required autocomplete="current-password"></label>' +
        '<div class="row"><button class="primary" type="submit">Войти</button><a href="/">На главную</a></div>' +
        '<p class="error" id="err"></p></form></section>';
      app.querySelector("#admin-login").addEventListener("submit", async function (event) {
        event.preventDefault();
        const password = String(new FormData(event.target).get("password") || "");
        try {
          await api("/api/admin/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ password: password })
          });
          sessionStorage.setItem(ADMIN_KEY, password);
          admin();
        } catch (err) {
          app.querySelector("#err").textContent = err.message;
        }
      });
      return;
    }
    let data;
    try {
      data = await api("/api/admin", { headers: adminHeaders() });
    } catch (err) {
      sessionStorage.removeItem(ADMIN_KEY);
      app.innerHTML = '<section class="gate"><div class="card"><h1>Админ</h1><p class="error">' + esc(err.message) +
        '</p><a href="/admin">Снова</a></div></section>';
      return;
    }
    function bytes(n) {
      const v = Number(n) || 0;
      if (v < 1024) return v + " B";
      if (v < 1048576) return (v / 1024).toFixed(1) + " KB";
      if (v < 1073741824) return (v / 1048576).toFixed(1) + " MB";
      return (v / 1073741824).toFixed(2) + " GB";
    }
    const rooms = (data.rooms || []).map(function (room) {
      const bin = room.deletedAt ? ' <span class="note">корзина</span>' : "";
      return '<article class="room-row"><b>' + esc(room.title || "Комната") + "</b>" + bin +
        '<span class="note">' + esc(room.id) + " · " + bytes(room.filesBytes) + " / " + bytes(data.roomFilesMax) + "</span>" +
        '<div class="row">' +
        '<a href="/m/' + esc(room.id) + '">Мастер</a>' +
        '<button type="button" data-dump="' + esc(room.id) + '">Выгрузка</button>' +
        '<button type="button" data-reset="' + esc(room.id) + '">Сбросить пароль</button>' +
        (room.deletedAt
          ? '<button type="button" data-restore="' + esc(room.id) + '">Вернуть</button><button type="button" data-purge="' + esc(room.id) + '">Удалить навсегда</button>'
          : '<button type="button" data-drop="' + esc(room.id) + '">В корзину</button>') +
        "</div></article>";
    }).join("") || '<p class="note">Комнат нет.</p>';
    app.innerHTML = '<section class="gate"><div class="gate-stack">' +
      '<div class="card"><h1>Админ</h1>' +
      '<label class="check" title="Разрешить создание комнат с главной"><input id="public-create" type="checkbox"' +
      (data.publicCreate !== false ? " checked" : "") + "> Публичное создание комнат</label>" +
      '<div class="row"><button type="button" id="save-config">Сохранить</button>' +
      '<button type="button" id="clear-trash">Очистить корзину</button>' +
      '<button type="button" id="backup-all">Полный бэкап на диск</button>' +
      '<button type="button" id="reset-all">Сбросить все пароли</button>' +
      '<a href="/">На главную</a></div>' +
      '<p class="error" id="err"></p><p class="note" id="ok"></p></div>' +
      '<form class="card" id="admin-create"><h2>Создать комнату</h2>' +
      '<label>Название<input name="title" value="Комната" required></label>' +
      '<label>Пароль<input name="password" type="password" minlength="4" autocomplete="new-password" placeholder="пусто = случайный"></label>' +
      '<div class="row"><button class="primary" type="submit">Создать</button></div></form>' +
      '<form class="card" id="admin-import"><h2>Загрузить выгрузку</h2>' +
      '<p class="note">Только для админа. Создаёт новую комнату из .shirmo.json.</p>' +
      '<label>Пароль<input name="password" type="password" minlength="4" autocomplete="new-password" placeholder="пусто = случайный"></label>' +
      '<div class="row"><label class="file-btn" title="Файл выгрузки">' +
      '<input id="admin-pack" type="file" accept="application/json,.json" required>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10M8 8l4-4 4 4M5 18h14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      "Файл</label><button class=\"primary\" type=\"submit\">Загрузить</button></div>" +
      '<span class="file-name" id="admin-pack-name"></span></form>' +
      '<section class="card"><h2>Комнаты</h2>' + rooms + "</section></div></section>";
    const err = app.querySelector("#err");
    const ok = app.querySelector("#ok");
    app.querySelector("#save-config").addEventListener("click", async function () {
      try {
        const saved = await api("/api/admin/config", {
          method: "PUT",
          headers: adminHeaders(),
          body: JSON.stringify({ publicCreate: !!app.querySelector("#public-create").checked })
        });
        ok.textContent = saved.publicCreate ? "Сохранено: создание с главной включено." : "Сохранено: создание с главной выключено.";
        err.textContent = "";
        app.querySelector("#public-create").checked = saved.publicCreate !== false;
      } catch (fail) {
        err.textContent = fail.message;
      }
    });
    const packInput = app.querySelector("#admin-pack");
    const packName = app.querySelector("#admin-pack-name");
    if (packInput && packName) {
      packInput.addEventListener("change", function () {
        packName.textContent = (this.files && this.files[0] && this.files[0].name) || "";
      });
    }
    app.querySelector("#admin-import").addEventListener("submit", async function (event) {
      event.preventDefault();
      const password = new FormData(event.target).get("password");
      const file = packInput && packInput.files && packInput.files[0];
      if (!file) {
        err.textContent = "Выберите файл выгрузки";
        return;
      }
      try {
        const pack = JSON.parse(await file.text());
        const room = await api("/api/rooms/import", {
          method: "POST",
          headers: adminHeaders(),
          body: JSON.stringify(Object.assign({}, pack, { password: password || undefined }))
        });
        rememberRoom({ id: room.id, title: room.title, key: room.masterKey });
        window.alert("Комната " + room.id + "\nПароль: " + room.masterKey);
        admin();
      } catch (fail) {
        err.textContent = fail.message;
      }
    });
    app.querySelector("#clear-trash").addEventListener("click", async function () {
      if (!window.confirm("Удалить все комнаты из корзины навсегда?")) return;
      try {
        const res = await api("/api/admin/trash", { method: "DELETE", headers: adminHeaders() });
        ok.textContent = "Удалено из корзины: " + (res.purged || 0);
        admin();
      } catch (fail) {
        err.textContent = fail.message;
      }
    });
    app.querySelector("#backup-all").addEventListener("click", async function () {
      try {
        const res = await api("/api/admin/backup", { method: "POST", headers: adminHeaders(), body: "{}" });
        ok.textContent = "Бэкап: " + res.dir + " (" + res.rooms + " комн.)";
      } catch (fail) {
        err.textContent = fail.message;
      }
    });
    app.querySelector("#reset-all").addEventListener("click", async function () {
      if (!window.confirm("Сбросить пароли всех комнат? Новые пароли покажутся один раз.")) return;
      try {
        const res = await api("/api/admin/passwords/reset-all", { method: "POST", headers: adminHeaders(), body: "{}" });
        ok.textContent = (res.rooms || []).map(function (row) {
          return row.id + " · " + (row.title || "") + " · " + row.masterKey;
        }).join(" | ");
      } catch (fail) {
        err.textContent = fail.message;
      }
    });
    app.querySelector("#admin-create").addEventListener("submit", async function (event) {
      event.preventDefault();
      const form = new FormData(event.target);
      try {
        const room = await api("/api/admin/rooms", {
          method: "POST",
          headers: adminHeaders(),
          body: JSON.stringify({ title: form.get("title"), password: form.get("password") || undefined })
        });
        rememberRoom({ id: room.id, title: room.title, key: room.masterKey });
        ok.textContent = "Создано. Пароль: " + room.masterKey;
        window.alert("Комната " + room.id + "\nПароль: " + room.masterKey);
        admin();
      } catch (fail) {
        err.textContent = fail.message;
      }
    });
    app.querySelector(".gate-stack").addEventListener("click", async function (event) {
      const reset = event.target.closest("[data-reset]");
      const dump = event.target.closest("[data-dump]");
      const drop = event.target.closest("[data-drop]");
      const back = event.target.closest("[data-restore]");
      const purge = event.target.closest("[data-purge]");
      const button = reset || dump || drop || back || purge;
      if (!button) return;
      const id = button.getAttribute("data-reset") || button.getAttribute("data-dump") ||
        button.getAttribute("data-drop") || button.getAttribute("data-restore") ||
        button.getAttribute("data-purge");
      try {
        if (dump) {
          if (dump.disabled) return;
          dump.disabled = true;
          const label = dump.textContent;
          dump.textContent = "…";
          try {
            await downloadBackup("/api/admin/rooms/" + id + "/backup", adminHeaders());
          } catch (fail) {
            backupToast(fail.message || "ошибка выгрузки", "err");
            setTimeout(function () { backupToast(""); }, 4000);
            throw fail;
          } finally {
            dump.disabled = false;
            dump.textContent = label;
          }
          return;
        }
        if (reset) {
          const res = await api("/api/admin/rooms/" + id + "/password", {
            method: "POST",
            headers: adminHeaders(),
            body: "{}"
          });
          window.alert("Новый пароль:\n" + res.masterKey);
          rememberRoom({ id: id, key: res.masterKey });
        } else if (drop) {
          await api("/api/rooms/" + id, { method: "DELETE", headers: adminHeaders() });
          admin();
        } else if (back) {
          await api("/api/rooms/" + id + "/restore", { method: "POST", headers: adminHeaders(), body: "{}" });
          admin();
        } else if (purge) {
          if (!window.confirm("Удалить навсегда?")) return;
          await api("/api/rooms/" + id + "/purge", { method: "DELETE", headers: adminHeaders() });
          admin();
        }
      } catch (fail) {
        err.textContent = fail.message;
      }
    });
  }

  async function fillShelf() {
    const shelf = app.querySelector("#shelf");
    if (!shelf) return;
    const known = {};
    readShelf().forEach(function (item) { known[item.id] = item; });
    let rooms = [];
    let trash = [];
    try {
      const data = await api("/api/rooms");
      rooms = data.rooms || [];
      trash = data.trash || [];
    } catch (err) {
      shelf.innerHTML = "<h2>Комнаты</h2>" + '<p class="error">' + esc(err.message) + "</p>";
      return;
    }
    const rowHtml = function (room, bin) {
      const saved = known[room.id];
      return '<article class="room-row"><b>' + esc(room.title || "Комната") + "</b>" +
        '<span class="note">' + esc(whenText(bin ? room.deletedAt : room.updatedAt)) + "</span>" +
        '<div class="row">' +
        (bin
          ? '<button type="button" data-restore="' + esc(room.id) + '">Вернуть</button>' +
            '<button type="button" data-purge="' + esc(room.id) + '">Удалить из корзины</button>'
          : '<button type="button" data-enter="' + esc(room.id) + '">Мастер</button>' +
            '<a href="/v/' + esc(room.id) + '">Игроки</a>' +
            '<button type="button" data-drop="' + esc(room.id) + '">Удалить</button>') +
        (saved ? '<span class="note">пароль в браузере</span>' : "") +
        "</div></article>";
    };
    shelf.innerHTML = "<h2>Комнаты</h2>" +
      '<p class="note">Вход и удаление — по паролю мастера. Выгрузка — внутри комнаты.</p>' +
      (rooms.map(function (room) { return rowHtml(room, false); }).join("") || '<p class="note">Пока нет комнат.</p>') +
      "<h2>Корзина</h2>" +
      (trash.map(function (room) { return rowHtml(room, true); }).join("") || '<p class="note">Корзина пуста.</p>');
    shelf.onclick = async function (event) {
      const enter = event.target.closest("[data-enter]");
      const drop = event.target.closest("[data-drop]");
      const back = event.target.closest("[data-restore]");
      const purge = event.target.closest("[data-purge]");
      const button = enter || drop || back || purge;
      if (!button || !shelf.contains(button)) return;
      const id = button.getAttribute("data-enter") || button.getAttribute("data-drop") ||
        button.getAttribute("data-restore") || button.getAttribute("data-purge");
      let key = (known[id] && known[id].key) || sessionStorage.getItem(keyName(id)) || "";
      if (!key) key = askPass("Пароль мастера");
      if (!key) return;
      button.disabled = true;
      try {
        if (enter) {
          await api("/api/rooms/" + id + "/campaign", { headers: { authorization: "Bearer " + key } });
          rememberRoom({ id: id, key: key });
          sessionStorage.setItem(keyName(id), key);
          location.href = "/m/" + id;
          return;
        }
        if (drop) {
          await api("/api/rooms/" + id, { method: "DELETE", headers: { authorization: "Bearer " + key } });
        } else if (purge) {
          await api("/api/rooms/" + id + "/purge", { method: "DELETE", headers: { authorization: "Bearer " + key } });
          localStorage.setItem(SHELF, JSON.stringify(readShelf().filter(function (item) { return item.id !== id; })));
        } else {
          await api("/api/rooms/" + id + "/restore", { method: "POST", headers: { authorization: "Bearer " + key } });
        }
        fillShelf();
      } catch (err) {
        button.disabled = false;
        window.alert(err.message);
      }
    };
  }

  function showDie(roll, onClose) {
    if (!roll || !window.ShirmoDice) return;
    const old = document.querySelector(".die-show");
    if (old) old.remove();
    const show = document.createElement("div");
    show.className = "die-show";
    const check = roll.label || "";
    const name = roll.name || "";
    const verdict = roll.verdict === "Пробил" || roll.verdict === "Не пробил" || roll.verdict === "Крит" ? roll.verdict : "";
    show.innerHTML = '<div class="die-frame">' +
      (check ? '<p class="die-check">' + esc(check) + "</p>" : "") +
      '<b class="die-total">' + esc(String(roll.total)) + "</b>" +
      (verdict ? '<p class="die-verdict' + (verdict === "Не пробил" ? " is-miss" : " is-hit") + '">' + esc(verdict) + "</p>" : "") +
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

  function boardFontSize(value) {
    const n = Math.round(Number(value) || 0);
    return Math.min(28, Math.max(12, n || 16));
  }

  function readShopFont(campaign) {
    if (campaign && campaign.shopFont != null && campaign.shopFont !== "") {
      return boardFontSize(campaign.shopFont);
    }
    return boardFontSize(sessionStorage.getItem("shirmo-board-font") || 16);
  }

  function writeShopFont(size, campaign) {
    const next = boardFontSize(size);
    sessionStorage.setItem("shirmo-board-font", String(next));
    if (campaign) campaign.shopFont = next;
    return next;
  }

  function shopFontControl(font) {
    return '<label class="board-font" title="Размер шрифта списка">Aa<input data-board-font type="range" min="12" max="28" step="1" value="' +
      boardFontSize(font) + '" aria-label="Размер шрифта"></label>';
  }

  function bindShopFonts(root, onChange) {
    if (!root) return;
    root.querySelectorAll("[data-board-font]").forEach(function (input) {
      if (input._shopFontBound) return;
      input._shopFontBound = true;
      const card = input.closest(".board-card, .talk-shop");
      function apply() {
        const next = boardFontSize(input.value);
        if (card) card.style.setProperty("--board-font", next + "px");
        sessionStorage.setItem("shirmo-board-font", String(next));
        if (typeof onChange === "function") onChange(next);
      }
      input.addEventListener("input", apply);
      input.addEventListener("click", function (event) { event.stopPropagation(); });
      input.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
    });
  }

  window.ShirmoShopFont = {
    size: boardFontSize,
    read: readShopFont,
    write: writeShopFont,
    control: shopFontControl,
    bind: bindShopFonts
  };

  function showBoard(title, goods, onClose, opts) {
    const old = document.querySelector(".board-show");
    if (old) old.remove();
    const show = document.createElement("div");
    show.className = "board-show";
    const list = goods || [];
    const count = list.length;
    const cols = count > 24 ? 4 : (count > 14 ? 3 : (count > 7 ? 2 : 1));
    const font = boardFontSize((opts && opts.fontSize) || readShopFont(opts && opts.campaign));
    const rows = list.map(function (item) {
      const icon = item.icon ? '<img alt="" src="' + esc(item.icon) + '">' : "";
      const note = String(item.note || "").trim();
      const ink = item.ink ? ' style="color:' + esc(item.ink) + '"' : "";
      return "<li" + ink + ">" + icon + '<span class="board-item"><b>' + esc(item.name || "Предмет") + "</b>" +
        (note ? '<small class="board-note">' + esc(note) + "</small>" : "") +
        "</span><em>" + esc(item.price || "") + "</em></li>";
    }).join("");
    show.innerHTML = '<div class="board-card board-cols-' + cols + '" role="dialog" aria-label="' + esc(title || "Товары") + '" style="--board-font:' + font + 'px">' +
      '<div class="board-head"><h2>' + esc(title || "Товары") + "</h2>" + shopFontControl(font) + "</div>" +
      '<ul class="board-grid">' + (rows || '<li class="note">Пусто</li>') + "</ul></div>";
    document.body.appendChild(show);
    bindShopFonts(show, function (size) {
      writeShopFont(size, opts && opts.campaign);
      if (opts && typeof opts.onFont === "function") opts.onFont(size);
    });
    show.addEventListener("click", function (event) {
      if (event.target.closest(".board-card")) return;
      show.remove();
      if (onClose) onClose();
    });
  }

  function publishGoods(roomId, headers, goods, campaign) {
    const list = (goods || []).slice(0, 40).map(function (item) {
      const ink = window.ShirmoItems ? window.ShirmoItems.inkOf(item) : (item.ink || "");
      return {
        name: item.name || "",
        price: item.price || "",
        icon: item.icon || "",
        note: item.note || "",
        ink: ink,
        rarity: item.rarity || ""
      };
    }).filter(function (item) { return String(item.name).trim(); });
    let fontSize = readShopFont(campaign);
    function send(size) {
      return api("/api/rooms/" + roomId + "/events", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ type: "wares", text: "Товары", goods: list, fontSize: size })
      });
    }
    showBoard("Товары", list, function () { hidePlayerGoods(roomId, headers); }, {
      fontSize: fontSize,
      campaign: campaign,
      onFont: function (size) {
        fontSize = writeShopFont(size, campaign);
        send(fontSize);
      }
    });
    return send(fontSize);
  }

  function pushShopFont(roomId, headers, campaign) {
    return api("/api/rooms/" + roomId + "/events", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ type: "wares-font", fontSize: readShopFont(campaign) })
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

  function showPlayerTimer(event) {
    let layer = document.getElementById("play-timer");
    if (!event || event.on === false) {
      if (layer) {
        clearInterval(layer._beat);
        layer.remove();
      }
      if (window.ShirmoFx) window.ShirmoFx.stop();
      return;
    }
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "play-timer";
      layer.innerHTML = '<p class="clock-timer" data-left></p><div class="play-end" data-end hidden><img alt="" data-end-img><p data-end-text></p></div>';
      document.body.appendChild(layer);
    }
    const shapes = { square: 1, round: 1, narrow: 1, segment: 1 };
    const shape = shapes[event.shape] ? event.shape : "square";
    const size = Math.min(120, Math.max(28, Math.round(Number(event.size) || 40)));
    layer.className = "play-timer shape-" + shape + (event.back ? " has-back" : "");
    layer.style.setProperty("--clock-size", size + "px");
    if (event.back) {
      layer.style.backgroundImage = "url('" + String(event.back).replace(/'/g, "") + "')";
    } else layer.style.backgroundImage = "";
    const node = layer.querySelector("[data-left]");
    const endBox = layer.querySelector("[data-end]");
    const endImg = layer.querySelector("[data-end-img]");
    const endText = layer.querySelector("[data-end-text]");
    const until = Number(event.until) || 0;
    const remain = Math.max(0, Number(event.remain) || 0);
    const span = Math.max(1, Number(event.span) || remain || 1);
    const running = event.running === true && until > 0;
    const linked = event.linked !== false;
    const effect = event.effect || "";
    if (window.ShirmoFx) {
      if (effect && (linked || event.fxRun)) {
        window.ShirmoFx.sync({
          kind: effect,
          power: event.power,
          speed: event.speed,
          hand: event.hand,
          face: event.face,
          storm: !!event.storm,
          linked: linked,
          until: running ? until : 0,
          left: running ? Math.max(0, until - Date.now()) : remain,
          reset: !!event.fxReset,
          progress: linked ? 1 - remain / span : undefined
        });
      } else window.ShirmoFx.stop();
    }
    function pad(n) { return String(n).padStart(2, "0"); }
    function draw(ms) {
      const left = Math.max(0, ms);
      const total = Math.ceil(left / 1000);
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;
      const raw = hours ? pad(hours) + ":" + pad(minutes) + ":" + pad(seconds) : pad(minutes) + ":" + pad(seconds);
      node.innerHTML = raw.split("").map(function (ch) {
        return '<span class="' + (ch === ":" ? "colon" : "digit") + '">' + ch + "</span>";
      }).join("");
      const showDigits = !effect || event.digits === true;
      node.hidden = !showDigits;
      const finished = left <= 0 && (event.done === true || running);
      node.classList.toggle("is-run", running && !finished);
      node.classList.toggle("is-done", finished);
      if (endBox) {
        endBox.hidden = !finished || (!event.endText && !event.endImage);
        if (endImg) {
          if (finished && event.endImage) {
            endImg.hidden = false;
            endImg.src = event.endImage;
          } else {
            endImg.removeAttribute("src");
            endImg.hidden = true;
          }
        }
        if (endText) endText.textContent = finished ? (event.endText || "") : "";
      }
      layer.classList.toggle("is-quiet", !showDigits && (!endBox || endBox.hidden));
      if (linked && effect && window.ShirmoFx && window.ShirmoFx.setProgress) {
        const live = running ? Math.max(0, until - Date.now()) : left;
        if (window.ShirmoFx.setLeft) window.ShirmoFx.setLeft(live);
        window.ShirmoFx.setProgress(1 - live / span);
      }
    }
    clearInterval(layer._beat);
    function tick() { draw(running ? until - Date.now() : remain); }
    tick();
    layer._beat = setInterval(tick, 250);
  }

  function showPlayerClock(event) {
    let layer = document.getElementById("play-clock");
    if (!event || event.on === false) {
      if (layer) {
        clearInterval(layer._beat);
        layer.remove();
      }
      return;
    }
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "play-clock";
      layer.innerHTML = '<p class="clock-face" data-now></p>';
      document.body.appendChild(layer);
    }
    const shapes = { square: 1, round: 1, narrow: 1, segment: 1 };
    const shape = shapes[event.shape] ? event.shape : "square";
    const size = Math.min(120, Math.max(28, Math.round(Number(event.size) || 48)));
    layer.className = "play-clock shape-" + shape;
    layer.style.setProperty("--clock-size", size + "px");
    const node = layer.querySelector("[data-now]");
    function paint() {
      const now = new Date();
      node.innerHTML = digitHtml(pad2(now.getHours()) + ":" + pad2(now.getMinutes()) + ":" + pad2(now.getSeconds()));
    }
    clearInterval(layer._beat);
    paint();
    layer._beat = setInterval(paint, 250);
  }

  function viewer(id) {
    app.innerHTML = '<section class="viewer"><div class="stage-wrap" id="view"></div></section>';
    const view = app.querySelector("#view");
    let flashTimer = 0;
    function paint(frame, event) {
      if (event && event.type === "timer") {
        showPlayerTimer(event);
        return;
      }
      if (event && event.type === "clock") {
        showPlayerClock(event);
        return;
      }
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
      if (event && event.type === "wares-font") {
        const font = boardFontSize(event.fontSize);
        document.querySelectorAll(".board-card, .talk-shop").forEach(function (card) {
          card.style.setProperty("--board-font", font + "px");
        });
        return;
      }
      if (event && event.type === "wares") {
        showBoard(event.text || "Товары", event.goods || [], null, { fontSize: event.fontSize });
        return;
      }
      if (event && event.type === "map-image-hide") {
        if (window.ShirmoMap && window.ShirmoMap.closeZoomImage) window.ShirmoMap.closeZoomImage();
        return;
      }
      if (event && event.type === "map-image" && event.url) {
        if (window.ShirmoMap && window.ShirmoMap.zoomImage) window.ShirmoMap.zoomImage(event.url, true);
        return;
      }
      const look = textLook(frame && frame.page);
      const battle = window.ShirmoBattle;
      const hold = view._battleHold;
      const prevPort = battle && battle.bindPan ? view.querySelector(".play-battle .battle-stage") : null;
      if (hold && prevPort) {
        hold.left = prevPort.scrollLeft;
        hold.top = prevPort.scrollTop;
      }
      const actors = frame && frame.page && frame.page.kind === "battle" ? (frame.page.actors || []) : null;
      const activeId = actors ? ((actors.find(function (actor) { return actor.active; }) || {}).id || "") : "";
      const follow = !hold || hold.active !== activeId;
      if (hold) hold.active = activeId;
      view.innerHTML = stageHtml(frame) + (event ? '<div class="flash" style="' + look.flash + '">' + esc(event.text) + "</div>" : "");
      bindShopFonts(view);
      if (window.ShirmoMap && window.ShirmoMap.bindImages) window.ShirmoMap.bindImages(view);
      fit(view);
      if (actors && battle) {
        if (follow && battle.revealActive) battle.revealActive(view);
        else if (battle.restorePan) battle.restorePan(view);
        const port = view.querySelector(".play-battle .battle-stage");
        if (hold && port) {
          hold.left = port.scrollLeft;
          hold.top = port.scrollTop;
        }
      }
      if (event) {
        clearTimeout(flashTimer);
        flashTimer = setTimeout(function () { paint(frame, null); }, 4000);
      }
    }
    if (window.ShirmoBattle && window.ShirmoBattle.bindPan) window.ShirmoBattle.bindPan(view);
    if (!view._playBound) {
      view._playBound = true;
      let busy = false;
      view.addEventListener("click", function (event) {
        const back = event.target.closest && event.target.closest("[data-up]");
        const loc = !back && event.target.closest && event.target.closest('.map-pin[data-kind="loc"]');
        const foe = !back && !loc && event.target.closest && event.target.closest(".map-pin[data-battle]");
        const turn = event.target.closest && event.target.closest(".play-battle [data-go]");
        if (!back && !loc && !foe && !turn) return;
        event.preventDefault();
        if (busy) return;
        busy = true;
        const body = turn
          ? { op: "turn", id: turn.getAttribute("data-go") || "" }
          : foe
            ? { op: "fight", id: foe.getAttribute("data-pin") || "" }
            : { op: "enter", id: (back ? back.getAttribute("data-up") : loc.getAttribute("data-pin")) || "" };
        fetch("/api/rooms/" + id + "/play", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        }).catch(function () {}).then(function () { busy = false; });
      });
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

  function modOf(value) {
    const mod = Math.round(Number(value));
    if (!Number.isFinite(mod)) return 0;
    return Math.min(99, Math.max(-99, mod));
  }

  function modSign(mod) {
    if (!mod) return "";
    return mod > 0 ? "+" + mod : String(mod);
  }

  function rollFormula(spec) {
    const mode = spec.mode === "advantage" || spec.mode === "disadvantage" ? spec.mode : "normal";
    const mod = modOf(spec.mod);
    const sign = modSign(mod);
    if (mode !== "normal") {
      const a = 1 + Math.floor(Math.random() * 20);
      const b = 1 + Math.floor(Math.random() * 20);
      const kept = mode === "advantage" ? Math.max(a, b) : Math.min(a, b);
      const total = kept + mod;
      const other = mode === "advantage" ? "disadvantage" : "advantage";
      const aKeep = a === b ? "" : (mode === "advantage" ? a > b : a < b) ? mode : other;
      const bKeep = a === b ? "" : aKeep === mode ? other : mode;
      return {
        name: spec.name || "",
        count: 2,
        sides: 20,
        mode: mode,
        mod: mod,
        total: total,
        dice: [
          { sides: 20, value: a, tint: aKeep },
          { sides: 20, value: b, tint: bKeep }
        ],
        log: a + " · " + b + " → " + (mod ? kept + sign + "=" + total : total),
        label: (mode === "advantage" ? "Преимущество" : "Помеха") + (sign ? " " + sign : "")
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
    const shown = total + mod;
    const body = count === 1 ? String(dice[0]) : dice.join("+");
    return {
      name: spec.name || "",
      count: count,
      sides: sides,
      mode: "normal",
      mod: mod,
      total: shown,
      dice: dice.map(function (value) { return { sides: sides, value: value }; }),
      log: mod ? body + sign + "=" + shown : (count === 1 ? String(shown) : body + "=" + shown),
      label: count + "d" + sides + sign
    };
  }

  function rollText(roll) {
    const title = roll.name ? roll.name + ": " : "";
    const verdict = roll.verdict ? roll.verdict + " · " : "";
    return title + verdict + (roll.label ? roll.label + " " : "") + roll.log;
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

  function pad2(n) { return String(n).padStart(2, "0"); }
  function digitHtml(text) {
    return String(text).split("").map(function (ch) {
      return '<span class="' + (ch === ":" ? "colon" : "digit") + '">' + ch + "</span>";
    }).join("");
  }
  function applyDigitLook(box, size, shape) {
    box.style.setProperty("--clock-size", size + "px");
    box.classList.remove("shape-square", "shape-round", "shape-narrow", "shape-segment");
    box.classList.add("shape-" + shape);
    box.querySelectorAll("[data-clock-shape]").forEach(function (button) {
      button.classList.toggle("is-on", button.getAttribute("data-clock-shape") === shape);
    });
  }
  function dragLayer(box, bar, locked) {
    let drag = null;
    bar.addEventListener("pointerdown", function (event) {
      if ((locked && locked()) || event.target.closest("button")) return;
      const rect = box.getBoundingClientRect();
      drag = { id: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      bar.setPointerCapture(event.pointerId);
    });
    bar.addEventListener("pointermove", function (event) {
      if (!drag || event.pointerId !== drag.id) return;
      const left = Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, event.clientX - drag.dx));
      const top = Math.max(8, Math.min(window.innerHeight - 48, event.clientY - drag.dy));
      box.style.left = left + "px";
      box.style.top = top + "px";
      box.style.right = "auto";
    });
    bar.addEventListener("pointerup", function () { drag = null; });
  }
  function clockTools() {
    return '<span class="clock-tools">' +
      '<button type="button" data-clock="pin" title="В сайдбар" aria-label="В сайдбар"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4.5h6l-.8 5.2 2.8 1.8v2H7v-2l2.8-1.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 13.5V20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>' +
      '<button type="button" data-clock="eye" title="Показать игрокам" aria-label="Показать игрокам"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>' +
      '<button type="button" data-clock="close" title="Закрыть" aria-label="Закрыть">×</button></span>';
  }

  function shapeButtons() {
    return '<div class="clock-shapes" role="group" aria-label="Форма цифр">' +
      '<button type="button" data-clock-shape="square" title="Прямые цифры">Прямые</button>' +
      '<button type="button" data-clock-shape="round" title="Круглые цифры">Круглые</button>' +
      '<button type="button" data-clock-shape="narrow" title="Узкие цифры">Узкие</button>' +
      '<button type="button" data-clock-shape="segment" title="Сегментные цифры">Сегмент</button></div>';
  }

  function openClock(opts) {
    opts = opts || {};
    let box = document.getElementById("clock-layer");
    if (box) {
      if (opts.roomId) box._roomId = opts.roomId;
      if (opts.headers) box._headers = opts.headers;
      if (opts.pin === true && box._setPinned) box._setPinned(true);
      else if (opts.unpin === true && box._setPinned) box._setPinned(false);
      else {
        box.hidden = false;
        if (box._wake) box._wake();
        if (box._place) box._place();
      }
      return;
    }
    box = document.createElement("div");
    box.id = "clock-layer";
    box.className = "clock-layer";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Часы");
    box.innerHTML = '<header class="clock-bar"><b>Часы</b>' + clockTools() + '</header>' +
      '<p class="clock-face" data-clock="now">00:00:00</p>' +
      '<label class="clock-size">Размер<input data-clock="size" type="range" min="28" max="120" value="48"></label>' +
      shapeButtons();
    document.body.appendChild(box);
    const nowNode = box.querySelector("[data-clock=now]");
    let size = 48;
    let shape = "square";
    let pinned = false;
    let beat = 0;
    let clockPlayers = false;
    const eyeBtn = box.querySelector("[data-clock=eye]");
    const pinHead = box.querySelector("[data-clock=pin]");
    function markEye() {
      eyeBtn.classList.toggle("is-on", clockPlayers);
      const label = clockPlayers ? "Скрыть у игроков" : "Показать игрокам";
      eyeBtn.title = label;
      eyeBtn.setAttribute("aria-label", label);
    }
    function pushClock() {
      const roomId = box._roomId;
      if (!roomId) return;
      fetch("/api/rooms/" + roomId + "/events", {
        method: "POST",
        headers: box._headers || { "content-type": "application/json" },
        body: JSON.stringify({ type: "clock", on: clockPlayers, size: size, shape: shape })
      }).catch(function () {});
    }
    box._roomId = opts.roomId || "";
    box._headers = opts.headers || null;
    function paint() {
      const now = new Date();
      nowNode.innerHTML = digitHtml(pad2(now.getHours()) + ":" + pad2(now.getMinutes()) + ":" + pad2(now.getSeconds()));
      if (box.hidden) {
        clearInterval(beat);
        beat = 0;
      }
    }
    function wake() {
      if (beat) return;
      paint();
      beat = setInterval(paint, 250);
    }
    box._wake = wake;
    box.querySelector("[data-clock=size]").addEventListener("input", function (event) {
      size = Math.min(120, Math.max(28, Math.round(Number(event.target.value) || 48)));
      applyDigitLook(box, size, shape);
      if (clockPlayers) pushClock();
    });
    box.querySelectorAll("[data-clock-shape]").forEach(function (button) {
      button.addEventListener("click", function () {
        shape = button.getAttribute("data-clock-shape") || "square";
        applyDigitLook(box, size, shape);
        if (clockPlayers) pushClock();
      });
    });
    dragLayer(box, box.querySelector(".clock-bar"), function () { return pinned; });
    function place() {
      const dock = document.getElementById("dock");
      const main = dock && dock.querySelector(".dock-main");
      const pinBtn = dock && dock.querySelector("[data-dock=clock]");
      const held = pinned && !box.hidden;
      if (pinBtn) {
        const label = held ? "Открепить часы" : "Закрепить часы";
        pinBtn.classList.toggle("is-on", held);
        pinBtn.title = label;
        pinBtn.setAttribute("aria-label", label);
      }
      if (pinHead) {
        pinHead.classList.toggle("is-on", pinned);
        const label = pinned ? "Убрать из сайдбара" : "В сайдбар";
        pinHead.title = label;
        pinHead.setAttribute("aria-label", label);
      }
      box.classList.toggle("is-pinned", pinned);
      if (pinned && main) {
        if (box.parentElement !== main) main.insertBefore(box, main.firstChild);
        return;
      }
      if (box.parentElement !== document.body) document.body.appendChild(box);
    }
    function setPinned(next) {
      pinned = !!next;
      if (pinned) {
        box.hidden = false;
        wake();
      }
      place();
    }
    box._place = place;
    box._setPinned = setPinned;
    box.querySelector("[data-clock=close]").addEventListener("click", function () {
      box.hidden = true;
      place();
    });
    pinHead.addEventListener("click", function () {
      const rail = document.querySelector("#dock [data-dock=clock]");
      if (rail) { rail.click(); return; }
      setPinned(!pinned);
    });
    eyeBtn.addEventListener("click", function () {
      clockPlayers = !clockPlayers;
      markEye();
      pushClock();
    });
    if (!box._watch) {
      const dock = document.getElementById("dock");
      if (dock) {
        box._watch = new MutationObserver(function () { if (pinned) place(); });
        box._watch.observe(dock, { childList: true });
      }
    }
    applyDigitLook(box, size, shape);
    wake();
    if (opts.pin) setPinned(true);
  }

  function openShelfPick(opts) {
    opts = opts || {};
    const old = document.getElementById("shelf-pick");
    if (old) old.remove();
    const box = document.createElement("div");
    box.id = "shelf-pick";
    box.className = "pop";
    const images = opts.images || [];
    const notes = opts.notes || [];
    let path = "";
    let query = "";
    function folders() {
      const set = {};
      images.forEach(function (item) {
        const folder = String(item && item.folder || "").trim();
        if (!folder) return;
        const parts = folder.split("/");
        let acc = "";
        parts.forEach(function (part) {
          acc = acc ? acc + "/" + part : part;
          set[acc] = true;
        });
      });
      return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, "ru"); });
    }
    function paint() {
      const q = query.trim().toLowerCase();
      if (opts.kind === "note") {
        const rows = notes.map(function (note, index) {
          return { note: note, index: index };
        }).filter(function (row) {
          if (!q) return true;
          return (String(row.note.name || "") + " " + String(row.note.text || "")).toLowerCase().indexOf(q) >= 0;
        });
        box.querySelector(".lib-pick-grid").innerHTML = rows.map(function (row) {
          const bit = String(row.note.text || "").replace(/\s+/g, " ").slice(0, 80);
          return '<button type="button" class="libx-card" data-note="' + row.index + '" title="' + esc(row.note.name || "Заметка") + '">' +
            '<div class="libx-thumb"><span class="libx-glyph">≡</span></div>' +
            "<strong>" + esc(row.note.name || "Заметка") + "</strong><small>" + esc(bit) + "</small></button>";
        }).join("") || '<p class="roll-empty libx-empty">Нет заметок</p>';
        return;
      }
      const all = folders();
      const dirs = q ? [] : all.filter(function (folder) {
        if (path && folder.indexOf(path + "/") !== 0) return false;
        const rest = path ? folder.slice(path.length + 1) : folder;
        return rest.indexOf("/") < 0;
      });
      const files = images.filter(function (item) {
        const folder = String(item && item.folder || "");
        const name = String(item && item.name || "");
        if (q) return (name + " " + folder).toLowerCase().indexOf(q) >= 0;
        return folder === path;
      });
      const crumbs = '<button type="button" data-path="">Справочник</button>' + (path ? path.split("/").reduce(function (html, part) {
        const acc = html.acc ? html.acc + "/" + part : part;
        return { acc: acc, html: html.html + " / <button type=\"button\" data-path=\"" + esc(acc) + "\">" + esc(part) + "</button>" };
      }, { acc: "", html: "" }).html : "");
      box.querySelector(".lib-pick-crumbs").innerHTML = crumbs;
      function countIn(folderPath) {
        return images.filter(function (item) {
          const folder = String(item && item.folder || "");
          return folder === folderPath || folder.indexOf(folderPath + "/") === 0;
        }).length;
      }
      box.querySelector(".lib-pick-grid").innerHTML = dirs.map(function (folder) {
        const name = folder.split("/").pop();
        return '<button type="button" class="libx-card is-dir" data-path="' + esc(folder) + '" title="' + esc(name) + '">' +
          '<div class="libx-thumb libx-folder-art" aria-hidden="true"></div>' +
          "<strong>" + esc(name) + "</strong><small>" + countIn(folder) + " шт.</small></button>";
      }).join("") + files.map(function (item) {
        return '<button type="button" class="libx-card" data-url="' + esc(item.url || "") + '" data-name="' + esc(item.name || "") + '" title="' + esc(item.name || "Картинка") + '">' +
          '<div class="libx-thumb">' + (item.url ? '<img alt="" src="' + esc(item.url) + '">' : "") + "</div>" +
          "<strong>" + esc(item.name || "Картинка") + "</strong></button>";
      }).join("") || '<p class="roll-empty libx-empty">Пусто</p>';
    }
    box.innerHTML = '<div class="pop-card shelf-pick"><div class="pop-head"><h2>' + (opts.kind === "note" ? "Заметки" : "Картинки") + "</h2>" +
      '<div class="pop-acts">' + (opts.kind === "note" ? "" : '<button type="button" data-clear>Без картинки</button>') +
      '<button type="button" data-close aria-label="Закрыть">×</button></div></div>' +
      '<input class="lib-pick-search" type="search" placeholder="Поиск" aria-label="Поиск">' +
      '<div class="lib-pick-crumbs"></div><div class="lib-pick-grid libx-grid"></div></div>';
    document.body.appendChild(box);
    box.querySelector("[data-close]").addEventListener("click", function () { box.remove(); });
    const clearBtn = box.querySelector("[data-clear]");
    if (clearBtn) clearBtn.addEventListener("click", function () {
      box.remove();
      if (opts.onPick) opts.onPick("", "");
    });
    box.addEventListener("click", function (event) {
      if (event.target === box) box.remove();
    });
    box.querySelector(".lib-pick-search").addEventListener("input", function (event) {
      query = event.target.value;
      paint();
    });
    box.querySelector(".lib-pick-grid").addEventListener("click", function (event) {
      const dir = event.target.closest("[data-path]");
      if (dir && event.currentTarget.contains(dir)) {
        path = dir.getAttribute("data-path") || "";
        paint();
        return;
      }
      const card = event.target.closest("[data-url]");
      if (card) {
        const url = card.getAttribute("data-url") || "";
        const name = card.getAttribute("data-name") || "";
        box.remove();
        if (opts.onPick) opts.onPick(url, name);
        return;
      }
      const noteBtn = event.target.closest("[data-note]");
      if (noteBtn) {
        const note = notes[Number(noteBtn.getAttribute("data-note"))];
        box.remove();
        if (note && opts.onPick) opts.onPick(note);
      }
    });
    box.querySelector(".lib-pick-crumbs").addEventListener("click", function (event) {
      const dir = event.target.closest("[data-path]");
      if (!dir) return;
      path = dir.getAttribute("data-path") || "";
      paint();
    });
    paint();
  }

  window.ShirmoShelf = {
    pick: openShelfPick,
    library: function () { return { images: [], notes: [] }; },
    openSelect: function (select) {
      if (!select) return;
      const kind = select.getAttribute("data-shelf") === "note" ? "note" : "image";
      const lib = window.ShirmoShelf.library() || {};
      openShelfPick({
        kind: kind,
        images: lib.images || [],
        notes: lib.notes || [],
        onPick: function (picked) {
          select.value = kind === "note" ? (picked && picked.id || "") : (picked || "");
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    },
    arm: function () {}
  };
  (function armShelfClicks() {
    let last = 0;
    function hit(event) {
      const node = event.target;
      if (!node || !node.closest) return null;
      const direct = node.closest("select[data-shelf]");
      if (direct) return direct;
      const label = node.closest("label");
      return label && label.querySelector("select[data-shelf]");
    }
    document.addEventListener("pointerdown", function (event) {
      const select = hit(event);
      if (!select || select.disabled) return;
      event.preventDefault();
      const now = Date.now();
      if (now - last < 350) return;
      last = now;
      window.ShirmoShelf.openSelect(select);
    }, true);
    document.addEventListener("mousedown", function (event) {
      const select = hit(event);
      if (!select || select.disabled) return;
      event.preventDefault();
    }, true);
    document.addEventListener("keydown", function (event) {
      const select = event.target;
      if (!select || !select.matches || !select.matches("select[data-shelf]")) return;
      if (event.key !== "Enter" && event.key !== " " && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      window.ShirmoShelf.openSelect(select);
    }, true);
  })();

  function openTimer(opts) {
    opts = opts || {};
    let box = document.getElementById("timer-layer");
    if (box) {
      if (opts.roomId) box._roomId = opts.roomId;
      if (opts.headers) box._headers = opts.headers;
      if (opts.upload) box._upload = opts.upload;
      if (opts.keep) box._keep = opts.keep;
      if (opts.library) box._library = opts.library;
      if (opts.saveNote) box._saveNote = opts.saveNote;
      if (opts.pin === true && box._setPinned) box._setPinned(true);
      else if (opts.unpin === true && box._setPinned) box._setPinned(false);
      else if (opts.silent) {
        if (box._wake) box._wake();
      } else {
        box.hidden = false;
        if (box._wake) box._wake();
        if (box._place) box._place();
      }
      return;
    }
    box = document.createElement("div");
    box.id = "timer-layer";
    box.className = "clock-layer timer-layer";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Таймер");
    box.innerHTML = '<header class="clock-bar"><b>Таймер</b>' + clockTools() + '</header>' +
      '<p class="clock-timer" data-clock="left">05:00</p>' +
      '<div class="clock-set"><label>мин<input data-clock="min" type="number" min="0" max="599" value="5"></label>' +
      '<label>сек<input data-clock="sec" type="number" min="0" max="59" value="0"></label></div>' +
      '<div class="clock-presets"><button type="button" data-clock-min="1">1</button><button type="button" data-clock-min="5">5</button><button type="button" data-clock-min="10">10</button><button type="button" data-clock-min="30">30</button></div>' +
      '<label class="clock-size">Размер<input data-clock="size" type="range" min="28" max="120" value="40"></label>' +
      shapeButtons() +
      '<div class="clock-acts"><button type="button" data-clock="run">Старт</button><button type="button" data-clock="reset">Сброс</button></div>' +
      '<button type="button" class="clock-players" data-clock="players">Вывести таймер для игроков</button>' +
      '<label class="check" title="Показывать цифры таймера поверх эффекта. Без эффекта цифры видны всегда"><input data-fx="digits" type="checkbox"> Цифры поверх эффекта</label>' +
      '<p class="clock-cap">Эффект</p>' +
      '<label class="clock-size">Вид<select data-fx="kind">' +
      '<option value="">Нет</option>' +
      '<option value="sand">Песочные часы</option>' +
      '<option value="magic">Магические часы</option>' +
      '<option value="smoke">Дым</option>' +
      '<option value="blizzard">Вьюга</option>' +
      '<option value="fire">Пожар</option>' +
      '<option value="flood">Потоп</option></select></label>' +
      '<label class="check"><input data-fx="free" type="checkbox"> Отвязать от таймера</label>' +
      '<label class="clock-size">Интенсивность<input data-fx="power" type="range" min="1" max="100" value="50"></label>' +
      '<label class="clock-size" data-fx="speed-row" hidden>Скорость заполнения<input data-fx="speed" type="range" min="1" max="100" value="40"></label>' +
      '<div class="fx-extra" data-fx="magic" hidden>' +
      '<label class="clock-size">Стрелки<input data-fx="hand" type="color" value="#1a2744"></label>' +
      '<label class="clock-size">Фон часов<input data-fx="face" type="color" value="#f4e7c8"></label></div>' +
      '<label class="check fx-extra" data-fx="flood" hidden><input data-fx="storm" type="checkbox"> Дождь и ураган</label>' +
      '<div class="clock-acts" data-fx="free-acts" hidden><button type="button" data-fx="play">Запустить эффект</button><button type="button" data-fx="halt">Стоп</button></div>' +
      '<label class="clock-size">Текст в конце<textarea data-fx="end-text" rows="2" placeholder="Время вышло"></textarea></label>' +
      '<div class="clock-acts"><button type="button" data-fx="pick-note">Из заметок</button><button type="button" data-fx="save-note">В справочник</button></div>' +
      '<div class="clock-file"><span>Картинка в конце <b data-fx="end-image-name">Нет</b></span>' +
      '<div class="clock-acts"><button type="button" data-fx="pick-end">Справочник</button>' +
      '<label class="clock-upload">Файл<input type="file" accept="image/*" data-fx="file-end" aria-label="Загрузить картинку в конец"></label></div></div>' +
      '<input type="hidden" data-fx="end-image" value="">' +
      '<div class="clock-file"><span>Фон таймера <b data-fx="back-name">Нет</b></span>' +
      '<div class="clock-acts"><button type="button" data-fx="pick-back">Справочник</button>' +
      '<label class="clock-upload">Файл<input type="file" accept="image/*" data-fx="file-back" aria-label="Загрузить фон таймера"></label></div></div>' +
      '<input type="hidden" data-fx="back" value="">';
    document.body.appendChild(box);
    const leftNode = box.querySelector("[data-clock=left]");
    const runBtn = box.querySelector("[data-clock=run]");
    const minInput = box.querySelector("[data-clock=min]");
    const secInput = box.querySelector("[data-clock=sec]");
    const kindSel = box.querySelector("[data-fx=kind]");
    const powerInput = box.querySelector("[data-fx=power]");
    const speedInput = box.querySelector("[data-fx=speed]");
    const handInput = box.querySelector("[data-fx=hand]");
    const faceInput = box.querySelector("[data-fx=face]");
    const stormInput = box.querySelector("[data-fx=storm]");
    const freeInput = box.querySelector("[data-fx=free]");
    const endText = box.querySelector("[data-fx=end-text]");
    const endImage = box.querySelector("[data-fx=end-image]");
    const backImage = box.querySelector("[data-fx=back]");
    const endName = box.querySelector("[data-fx=end-image-name]");
    const backName = box.querySelector("[data-fx=back-name]");
    const digitsInput = box.querySelector("[data-fx=digits]");
    let mode = "idle";
    let remain = 0;
    let span = 5 * 60 * 1000;
    let tickAt = 0;
    let beat = 0;
    let audio = null;
    let playersOn = false;
    let size = 40;
    let shape = "square";
    let pushTimer = 0;
    let fxOn = false;
    let pinned = false;
    box._roomId = opts.roomId || "";
    box._headers = opts.headers || null;
    box._upload = opts.upload || box._upload || null;
    box._keep = opts.keep || box._keep || null;
    box._library = opts.library || box._library || function () { return { images: [], notes: [] }; };
    box._saveNote = opts.saveNote || box._saveNote || null;
    function picName(url) {
      const lib = box._library();
      const hit = (lib.images || []).find(function (item) { return item && item.url === url; });
      if (hit) return hit.name || "Картинка";
      if (!url) return "Нет";
      const bit = String(url).split("/").pop();
      return bit || "Картинка";
    }
    function showPic(which) {
      if (which === "end") endName.textContent = picName(endImage.value);
      else backName.textContent = picName(backImage.value);
    }
    function readSet(commit) {
      const minutes = Math.min(599, Math.max(0, Math.round(Number(minInput.value) || 0)));
      const seconds = Math.min(59, Math.max(0, Math.round(Number(secInput.value) || 0)));
      if (commit) {
        minInput.value = String(minutes);
        secInput.value = String(seconds);
      }
      return (minutes * 60 + seconds) * 1000;
    }
    function showLeft(ms) {
      const total = Math.max(0, Math.ceil(ms / 1000));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;
      leftNode.innerHTML = digitHtml(hours ? pad2(hours) + ":" + pad2(minutes) + ":" + pad2(seconds) : pad2(minutes) + ":" + pad2(seconds));
    }
    function snapshot(resetFx) {
      const running = mode === "run";
      const left = mode === "idle" ? readSet(false) : remain;
      return {
        type: "timer",
        on: true,
        running: running,
        until: running ? Date.now() + Math.max(0, left) : 0,
        remain: Math.max(0, Math.round(left)),
        size: size,
        shape: shape,
        done: mode === "done",
        span: mode === "idle" ? left : Math.max(left, span),
        effect: (freeInput.checked ? fxOn : !!kindSel.value) ? (kindSel.value || "") : "",
        linked: !freeInput.checked,
        fxRun: freeInput.checked ? fxOn : true,
        fxReset: !!resetFx,
        power: Number(powerInput.value) || 50,
        speed: Number(speedInput.value) || 40,
        hand: handInput.value,
        face: faceInput.value,
        storm: stormInput.checked,
        digits: digitsInput.checked,
        endText: endText.value || "",
        endImage: endImage.value || "",
        back: backImage.value || ""
      };
    }
    function pushPlayers() {
      if (!playersOn || !box._roomId) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(function () {
        fetch("/api/rooms/" + box._roomId + "/events", {
          method: "POST",
          headers: box._headers || { "content-type": "application/json" },
          body: JSON.stringify(snapshot())
        }).catch(function () {});
      }, 120);
    }
    function sendPlayers(body) {
      if (!box._roomId) return;
      clearTimeout(pushTimer);
      fetch("/api/rooms/" + box._roomId + "/events", {
        method: "POST",
        headers: box._headers || { "content-type": "application/json" },
        body: JSON.stringify(body)
      }).catch(function () {});
    }
    function paint() {
      if (mode === "run") remain = Math.max(0, remain - (Date.now() - tickAt));
      tickAt = Date.now();
      if (mode === "run" && remain <= 0) {
        mode = "done";
        remain = 0;
        ring();
        pushPlayers();
      }
      showLeft(mode === "idle" ? readSet(false) : remain);
      leftNode.classList.toggle("is-run", mode === "run");
      leftNode.classList.toggle("is-done", mode === "done");
      runBtn.textContent = mode === "run" ? "Пауза" : "Старт";
      minInput.disabled = mode === "run";
      secInput.disabled = mode === "run";
      if (box.hidden && mode !== "run") {
        clearInterval(beat);
        beat = 0;
      }
    }
    function arm() {
      try {
        if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
        if (audio.state === "suspended") audio.resume();
      } catch (err) { /* без звука */ }
    }
    function ring() {
      if (!audio) return;
      try {
        const tone = audio.createOscillator();
        const gain = audio.createGain();
        tone.frequency.value = 880;
        tone.connect(gain);
        gain.connect(audio.destination);
        gain.gain.setValueAtTime(0.06, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.7);
        tone.start();
        tone.stop(audio.currentTime + 0.7);
      } catch (err) { /* без звука */ }
    }
    function wake() {
      if (beat) return;
      paint();
      beat = setInterval(paint, 250);
    }
    box._wake = wake;
    function syncFxBoxes() {
      const free = freeInput.checked;
      box.querySelector("[data-fx=magic]").hidden = kindSel.value !== "magic";
      box.querySelector("[data-fx=flood]").hidden = kindSel.value !== "flood";
      box.querySelector("[data-fx=speed-row]").hidden = !free;
      box.querySelector("[data-fx=free-acts]").hidden = !free;
    }
    kindSel.addEventListener("change", function () {
      syncFxBoxes();
      pushPlayers();
    });
    powerInput.addEventListener("input", pushPlayers);
    speedInput.addEventListener("input", pushPlayers);
    handInput.addEventListener("input", pushPlayers);
    faceInput.addEventListener("input", pushPlayers);
    stormInput.addEventListener("change", pushPlayers);
    freeInput.addEventListener("change", function () {
      syncFxBoxes();
      pushPlayers();
    });
    endText.addEventListener("input", pushPlayers);
    digitsInput.addEventListener("change", pushPlayers);
    function chooseImage(which) {
      const lib = box._library();
      openShelfPick({
        kind: "image",
        images: lib.images || [],
        onPick: function (url, name) {
          const input = which === "end" ? endImage : backImage;
          input.value = url || "";
          showPic(which);
          if (name && box._keep && url) box._keep(url, name);
          pushPlayers();
        }
      });
    }
    box.querySelector("[data-fx=pick-end]").addEventListener("click", function () { chooseImage("end"); });
    box.querySelector("[data-fx=pick-back]").addEventListener("click", function () { chooseImage("back"); });
    box.querySelector("[data-fx=pick-note]").addEventListener("click", function () {
      const lib = box._library();
      openShelfPick({
        kind: "note",
        notes: lib.notes || [],
        onPick: function (note) {
          endText.value = note && note.text || "";
          pushPlayers();
        }
      });
    });
    box.querySelector("[data-fx=save-note]").addEventListener("click", function () {
      const text = endText.value || "";
      if (!text.trim() || !box._saveNote) return;
      const name = window.prompt("Название заметки", "Таймер") || "";
      if (!name.trim()) return;
      box._saveNote(name.trim(), text);
    });
    function takeFile(input, which) {
      const file = input.files && input.files[0];
      input.value = "";
      if (!file || !box._upload) return;
      box._upload(file).then(function (url) {
        if (!url) return;
        const target = which === "end" ? endImage : backImage;
        target.value = url;
        if (box._keep) box._keep(url, file.name || "Картинка");
        showPic(which);
        pushPlayers();
      }).catch(function () {});
    }
    box.querySelector("[data-fx=file-end]").addEventListener("change", function (event) { takeFile(event.target, "end"); });
    box.querySelector("[data-fx=file-back]").addEventListener("change", function (event) { takeFile(event.target, "back"); });
    box.querySelector("[data-fx=play]").addEventListener("click", function () {
      if (!kindSel.value) return;
      fxOn = true;
      if (!playersOn) {
        playersOn = true;
        markPlayers();
      }
      sendPlayers(snapshot(true));
    });
    box.querySelector("[data-fx=halt]").addEventListener("click", function () {
      fxOn = false;
      pushPlayers();
    });
    box.querySelector("[data-clock=close]").addEventListener("click", function () { box.hidden = true; });
    runBtn.addEventListener("click", function () {
      if (mode === "run") {
        mode = "pause";
        paint();
        pushPlayers();
        return;
      }
      if (mode === "idle" || mode === "done" || remain <= 0) {
        remain = readSet(true);
        span = remain;
        if (!remain) return;
      }
      arm();
      mode = "run";
      tickAt = Date.now();
      paint();
      pushPlayers();
    });
    box.querySelector("[data-clock=reset]").addEventListener("click", function () {
      mode = "idle";
      remain = 0;
      paint();
      pushPlayers();
    });
    box.querySelectorAll("[data-clock-min]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (mode === "run") return;
        minInput.value = button.getAttribute("data-clock-min");
        secInput.value = "0";
        mode = "idle";
        remain = 0;
        paint();
        pushPlayers();
      });
    });
    box.querySelector("[data-clock=size]").addEventListener("input", function (event) {
      size = Math.min(120, Math.max(28, Math.round(Number(event.target.value) || 40)));
      applyDigitLook(box, size, shape);
      pushPlayers();
    });
    box.querySelectorAll("[data-clock-shape]").forEach(function (button) {
      button.addEventListener("click", function () {
        shape = button.getAttribute("data-clock-shape") || "square";
        applyDigitLook(box, size, shape);
        pushPlayers();
      });
    });
    const playersBtn = box.querySelector("[data-clock=players]");
    const eyeBtn = box.querySelector("[data-clock=eye]");
    function markPlayers() {
      playersBtn.textContent = playersOn ? "Убрать таймер у игроков" : "Вывести таймер для игроков";
      playersBtn.classList.toggle("is-on", playersOn);
      eyeBtn.classList.toggle("is-on", playersOn);
      const label = playersOn ? "Скрыть у игроков" : "Показать игрокам";
      eyeBtn.title = label;
      eyeBtn.setAttribute("aria-label", label);
    }
    playersBtn.addEventListener("click", function () {
      playersOn = !playersOn;
      markPlayers();
      if (playersOn) sendPlayers(snapshot());
      else sendPlayers({ type: "timer", on: false });
    });
    eyeBtn.addEventListener("click", function () { playersBtn.click(); });
    box.querySelector("[data-clock=pin]").addEventListener("click", function () {
      const rail = document.querySelector("#dock [data-dock=timer]");
      if (rail) { rail.click(); return; }
      setPinned(!pinned);
    });
    dragLayer(box, box.querySelector(".clock-bar"), function () { return pinned; });
    function place() {
      const dock = document.getElementById("dock");
      const main = dock && dock.querySelector(".dock-main");
      const pinBtn = dock && dock.querySelector("[data-dock=timer]");
      const held = pinned && !box.hidden;
      if (pinBtn) {
        const label = held ? "Открепить таймер" : "Закрепить таймер";
        pinBtn.classList.toggle("is-on", held);
        pinBtn.title = label;
        pinBtn.setAttribute("aria-label", label);
      }
      const pinHead = box.querySelector("[data-clock=pin]");
      if (pinHead) {
        pinHead.classList.toggle("is-on", pinned);
        const label = pinned ? "Убрать из сайдбара" : "В сайдбар";
        pinHead.title = label;
        pinHead.setAttribute("aria-label", label);
      }
      box.classList.toggle("is-pinned", pinned);
      if (pinned && main) {
        const clock = main.querySelector("#clock-layer");
        const spot = clock ? clock.nextSibling : main.firstChild;
        if (box.parentElement !== main || (clock ? clock.nextSibling !== box : main.firstChild !== box)) {
          main.insertBefore(box, spot);
        }
        return;
      }
      if (box.parentElement !== document.body) document.body.appendChild(box);
    }
    function setPinned(next) {
      pinned = !!next;
      if (pinned) {
        box.hidden = false;
        wake();
      }
      place();
    }
    box._place = place;
    box._setPinned = setPinned;
    box.querySelector("[data-clock=close]").addEventListener("click", function () { place(); });
    if (!box._watch) {
      const dock = document.getElementById("dock");
      if (dock) {
        box._watch = new MutationObserver(function () { if (pinned) place(); });
        box._watch.observe(dock, { childList: true });
      }
    }
    syncFxBoxes();
    applyDigitLook(box, size, shape);
    wake();
    window.ShirmoClock = {
      read: function () {
        const left = mode === "run" || mode === "pause" ? Math.max(0, remain) : readSet(false);
        return { running: mode === "run", left: left };
      },
      arm: function (seconds, forceRun) {
        const total = Math.max(0, Math.round(Number(seconds) || 0));
        if (!total) return;
        const was = mode === "run" || forceRun === true;
        minInput.value = String(Math.floor(total / 60));
        secInput.value = String(total % 60);
        span = total * 1000;
        if (was) {
          remain = span;
          mode = "run";
          tickAt = Date.now();
        } else {
          mode = "idle";
          remain = 0;
        }
        paint();
        pushPlayers();
        wake();
      },
      pause: function () {
        if (mode !== "run") return;
        mode = "pause";
        paint();
        pushPlayers();
      },
      drive: function (opts) {
        opts = opts || {};
        const kinds = { "": 1, sand: 1, magic: 1, smoke: 1, blizzard: 1, fire: 1, flood: 1 };
        if (opts.kind != null && kinds[opts.kind] === 1) {
          kindSel.value = opts.kind;
          syncFxBoxes();
        }
        const total = Math.max(0, Math.round(Number(opts.seconds) || 0));
        if (total) {
          minInput.value = String(Math.floor(total / 60));
          secInput.value = String(total % 60);
          span = total * 1000;
        }
        const left = Math.max(0, Number(opts.left) || 0);
        if (opts.running && (left || span)) {
          remain = left || span;
          mode = "run";
          tickAt = Date.now();
        } else if (opts.paused) {
          remain = left;
          mode = remain ? "pause" : "idle";
        }
        if (opts.showPlayers && !playersOn) {
          playersOn = true;
          markPlayers();
        }
        paint();
        pushPlayers();
        wake();
      }
    };
    if (opts.pin) setPinned(true);
    if (opts.hidden) box.hidden = true;
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
        const sign = modSign(modOf(pin.mod));
        const formula = pin.mode === "advantage" ? "преимущество" + (sign ? " " + sign : "") : pin.mode === "disadvantage" ? "помеха" + (sign ? " " + sign : "") : (pin.count || 1) + "d" + (pin.sides || 20) + sign;
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
        '<label title="Плюс или минус к сумме костей, например 3 или −2">Модификатор <input id="die-mod" type="number" value="0"></label>' +
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
        mode: mode,
        mod: modOf(menu.querySelector("#die-mod").value)
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
        if (window.ShirmoDock) window.ShirmoDock.paint();
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
        if (window.ShirmoDock) window.ShirmoDock.paint();
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
      '<label title="Картинка на гранях. Берётся из библиотеки">Текстура <select id="die-look-tex" data-shelf="image">' + tex + "</select></label>";
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
    let key = takeKey(id);
    if (!key) {
      app.innerHTML = '<section class="gate"><form class="card" id="unlock"><h1>Пароль мастера</h1>' +
        '<p class="note">Введите пароль этой комнаты.</p>' +
        '<label>Пароль<input name="password" type="password" minlength="4" required autocomplete="current-password"></label>' +
        '<div class="row"><button class="primary" type="submit">Войти</button><a href="/">К списку</a></div>' +
        '<p class="error" id="err"></p></form></section>';
      app.querySelector("#unlock").addEventListener("submit", function (event) {
        event.preventDefault();
        const password = new FormData(event.target).get("password");
        sessionStorage.setItem(keyName(id), String(password || ""));
        rememberRoom({ id: id, key: String(password || "") });
        master(id);
      });
      return;
    }
    const headers = { authorization: "Bearer " + key, "content-type": "application/json" };
    rememberRoom({ id: id, key: key });
    let state;
    try {
      state = await api("/api/rooms/" + id + "/campaign", { headers: { authorization: headers.authorization } });
    } catch (err) {
      app.innerHTML = '<section class="gate"><div class="card"><h1>Комната не открылась</h1><p class="error">' + esc(err.message) + "</p></div></section>";
      return;
    }
    rememberRoom({ id: id, key: key, title: state.title });
    const page = function () {
      return state.campaign.pages.find(function (item) { return item.id === state.campaign.activePageId; }) || state.campaign.pages[0];
    };
    const scenePage = function () {
      return state.campaign.pages.find(function (item) { return item.kind !== "map"; }) || state.campaign.pages[0];
    };
    const viewerUrl = location.origin + "/v/" + id;

    function glyph(body) {
      return '<svg viewBox="0 0 24 24" aria-hidden="true">' + body + "</svg>";
    }
    app.innerHTML = '<section class="master"><header class="topbar">' +
      '<div class="top-corner">' +
      '<button type="button" id="top-kebab" class="kebab-btn" title="Меню" aria-label="Меню" aria-expanded="false">' + glyph('<circle cx="12" cy="6" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="18" r="1.5" fill="currentColor"/>') + "</button>" +
      '<div class="kebab-menu" id="kebab-menu" hidden>' +
      '<button type="button" id="roll" title="Бросок с преимуществом или помехой, закреплённые и история">Броски</button>' +
      '<button type="button" id="clock-open" title="Часы поверх ширмы">Часы</button>' +
      '<button type="button" id="timer-open" title="Таймер и эффекты поверх ширмы">Таймер</button>' +
      '<button type="button" id="roll-look" title="Скорость, цвет и текстура кубика">Кубик</button>' +
      '<button type="button" id="library" title="Открыть библиотеку файлов">Библиотека</button>' +
      '<div class="kebab-gap"></div>' +
      '<button type="button" id="backup" title="Скачать кампанию и файлы">Выгрузка</button>' +
      '<button type="button" id="pass" title="Сменить пароль мастера этой комнаты">Пароль</button>' +
      '<button type="button" id="copy-master" title="Скопировать ссылку с паролем мастера">Ссылка мастера</button>' +
      '<button type="button" id="copy" title="Скопировать ссылку для зрителей">Ссылка игроков</button>' +
      '<a href="' + esc(viewerUrl) + '" target="_blank" rel="noopener" title="Открыть экран игроков в новой вкладке">Открыть экран</a>' +
      "</div></div>" +
      '<div class="top-mid">' +
      '<nav class="top-mods" aria-label="Разделы">' +
      '<button type="button" id="mod-scene" class="is-on" title="Сцена" aria-label="Сцена">' + glyph('<rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 9h8M8 13h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>') + "</button>" +
      '<button type="button" id="mod-map" title="Карта" aria-label="Карта">' + glyph('<path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="11" r="1.6" fill="currentColor"/>') + "</button>" +
      '<button type="button" id="mod-codex" title="Справочник" aria-label="Справочник">' + glyph('<path d="M5 5.5h5.5A2.5 2.5 0 0113 8v11H8a3 3 0 00-3 3zM19 5.5h-5.5A2.5 2.5 0 0011 8v11h5a3 3 0 013 3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>') + "</button>" +
      '<button type="button" id="mod-battle" title="Бой" aria-label="Бой">' + glyph('<path d="M14.5 3.5l6 6M4.5 13.5l6 6M9.5 16.5l7-7M16.5 9.5l2-2M8.5 17.5l-2 2M5 19l2-2M19 5l-2 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>') + "</button>" +
      '<button type="button" id="mod-library" title="Библиотека" aria-label="Библиотека">' + glyph('<path d="M4 6h16v12H4zM8 6V4h8v2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 10h8M8 14h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>') + "</button>" +
      "</nav>" +
      '<input id="title" class="room-title" type="text" value="' + esc(state.title) + '" aria-label="Название комнаты" title="Название комнаты">' +
      "</div>" +
      '<div class="top-publish">' +
      '<div class="mode-switch">' +
      '<button type="button" id="mode-live" class="' + (state.publishMode === "live" ? "is-on" : "") + '" title="Правки открытой страницы сразу видны игрокам">Сразу</button>' +
      '<button type="button" id="mode-hold" class="' + (state.publishMode === "hold" ? "is-on" : "") + '" title="Игроки видят кадр, когда нажмёте «Показать»">Только по кнопке</button>' +
      "</div>" +
      '<button type="button" class="primary" id="show" title="Отправить игрокам то, что на экране сейчас">Показать</button>' +
      "</div></header><div class=\"master-row\"><div class=\"master-main\"><div class=\"work\" id=\"work-scene\"><aside class=\"side\">" +
      '<label title="Крупная строка на сцене">Заголовок<input id="page-title" type="text"></label>' +
      '<label title="Текст под заголовком">Текст<textarea id="page-text"></textarea></label>' +
      '<label title="Цвет фона сцены">Фон<input id="page-color" type="color"></label>' +
      '<label title="Цвет букв на сцене">Цвет текста<input id="page-ink" type="color"></label>' +
      '<label title="Размер заголовка">Размер <input id="page-size" type="range" min="24" max="140" value="64"></label>' +
      '<label title="Шрифт сцены">Шрифт<select id="page-font"></select></label>' +
      '<label title="Картинка из библиотеки на фон">Картинка<select id="page-pick" data-shelf="image"></select></label>' +
      '<label title="Текст заметки вместо своего текста">Заметка<select id="page-note" data-shelf="note"></select></label>' +
      '<p class="note">В режиме «Сразу» правки этой страницы уходят игрокам сами. «Показать» публикует кадр в любом режиме. Бросок виден игрокам карточкой с кубиком и остаётся в истории.</p>' +
      '<p class="error" id="err"></p></aside>' +
      '<div class="stage-wrap" id="preview"></div></div><div class="work" id="work-map" hidden></div><div class="work" id="work-codex" hidden></div><div class="work" id="work-battle" hidden></div><div class="work" id="work-library" hidden></div></div><aside id="dock" class="dock"></aside></div></section>';

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
    function timerBag(extra) {
      const bag = {
        roomId: id,
        headers: headers,
        upload: function (file) { return uploadFile(id, key, file); },
        keep: function (url, name) {
          if (window.ShirmoLib) window.ShirmoLib.keep(shelf(), { url: url, name: name || "Картинка", section: "Таймер" });
          save();
        },
        library: function () { return { images: shelf().images || [], notes: shelf().notes || [] }; },
        saveNote: function (name, text) {
          shelf().notes.unshift({ id: crypto.randomUUID(), name: name, text: text, folder: "" });
          save();
        }
      };
      return Object.assign(bag, extra || {});
    }
    window.ShirmoTurn = function (seconds) {
      const existed = !!document.getElementById("timer-layer");
      openTimer(timerBag(existed ? { silent: true } : {}));
      if (window.ShirmoClock && window.ShirmoClock.arm) window.ShirmoClock.arm(seconds, true);
    };
    window.ShirmoFight = function (opts) {
      const existed = !!document.getElementById("timer-layer");
      openTimer(timerBag(existed ? { silent: true } : { hidden: true }));
      if (window.ShirmoClock && window.ShirmoClock.drive) window.ShirmoClock.drive(opts || {});
    };
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
      if (window.ShirmoCodex) window.ShirmoCodex.adopt(state.campaign);
      try {
        await stashPortraits(state.campaign, function (file) { return uploadFile(id, key, file); });
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
    function publishRoll(spec) {
      const look = diceLook(state);
      const roll = rollFormula(spec || {});
      const bonus = Math.round(Number(spec && spec.bonus) || 0);
      if (bonus) {
        roll.total += bonus;
        roll.log = roll.log + (bonus > 0 ? "+" : "") + bonus + "=" + roll.total;
      }
      if (spec && spec.label) roll.label = spec.label;
      if (spec && spec.name) roll.name = spec.name;
      if (spec && Number.isFinite(Number(spec.ac))) {
        const ac = Math.max(0, Math.round(Number(spec.ac)));
        const face = roll.dice && roll.dice[0] ? Number(roll.dice[0].value) : NaN;
        const raw = Number.isFinite(face) ? face : roll.total - bonus;
        const crit = raw >= 20;
        const fumble = raw <= 1;
        const hit = crit || (!fumble && roll.total >= ac);
        roll.verdict = crit ? "Крит" : (hit ? "Пробил" : "Не пробил");
      }
      roll.color = (spec && spec.color) || look.color;
      roll.texture = (spec && spec.texture) || look.texture;
      roll.speed = look.speed;
      roll.animate = look.animate;
      return api("/api/rooms/" + id + "/events", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ type: "die", text: rollText(roll), roll: roll })
      }).then(function (data) {
        state.rolls = data.rolls || state.rolls;
        err.textContent = "";
        showDie((data.event && data.event.roll) || roll, function () {
          api("/api/rooms/" + id + "/events", {
            method: "POST",
            headers: headers,
            body: JSON.stringify({ type: "die-hide" })
          }).catch(function () {});
        });
        return data;
      });
    }
    function placeFoes(actors) {
      const page = (state.campaign.pages || []).find(function (item) { return item.kind === "map"; });
      if (!page || !page.views || !page.views.length) return;
      const view = page.views.find(function (item) { return item.id === page.activeViewId; }) || page.views[0];
      view.markers = view.markers || [];
      (actors || []).forEach(function (actor, index) {
        if (!actor || actor.side === "player") return;
        if (actor.markerId && view.markers.some(function (row) { return row.id === actor.markerId; })) return;
        const marker = {
          id: crypto.randomUUID(),
          kind: "foe",
          name: actor.name || "Враг",
          x: Math.min(0.92, 0.06 + (index % 8) * 0.11),
          y: Math.max(0.08, 0.86 - Math.floor(index / 8) * 0.12),
          locId: "",
          hidden: true,
          screen: false,
          portrait: actor.portrait || "",
          hp: actor.hp,
          hpMax: actor.hpMax,
          ac: actor.ac,
          weapon: actor.weapon || "",
          damage: actor.damage || "",
          bonus: actor.bonus || 0,
          actorId: actor.id,
          pinSize: 52
        };
        actor.markerId = marker.id;
        view.markers.push(marker);
      });
    }
    function showModule(kind) {
      if (window.ShirmoDock) window.ShirmoDock.paint();
      try { sessionStorage.setItem("shirmo-mod-" + id, kind); } catch (err) { /* нет хранилища */ }
      readForm();
      const mapHost = app.querySelector("#work-map");
      const codexHost = app.querySelector("#work-codex");
      const battleHost = app.querySelector("#work-battle");
      const libraryHost = app.querySelector("#work-library");
      if (kind !== "codex" && codexHost._codexFlush) codexHost._codexFlush();
      if (kind !== "battle" && state.campaign.battle) state.campaign.battle.screen = false;
      if (state.campaign.dungeon) delete state.campaign.dungeon;
      app.querySelector("#work-scene").hidden = kind !== "scene";
      mapHost.hidden = kind !== "map";
      codexHost.hidden = kind !== "codex";
      battleHost.hidden = kind !== "battle";
      libraryHost.hidden = kind !== "library";
      app.querySelector("#mod-scene").classList.toggle("is-on", kind === "scene");
      app.querySelector("#mod-map").classList.toggle("is-on", kind === "map");
      app.querySelector("#mod-codex").classList.toggle("is-on", kind === "codex");
      app.querySelector("#mod-battle").classList.toggle("is-on", kind === "battle");
      app.querySelector("#mod-library").classList.toggle("is-on", kind === "library");
      if (kind === "library") {
        mountLibrary(libraryHost, {
          campaign: state.campaign,
          shelf: shelf,
          save: save,
          fill: fill,
          err: err,
          upload: function (file) { return uploadFile(id, key, file); },
          sectionOf: function (image) {
            const npcs = (state.campaign.codex && state.campaign.codex.npcs) || [];
            return window.ShirmoLib ? window.ShirmoLib.title(image, npcs) : "Общее";
          }
        });
        return;
      }
      if (kind === "codex") {
        window.ShirmoCodex.mount(codexHost, {
          campaign: state.campaign,
          save: save,
          upload: function (file) { return uploadFile(id, key, file); },
          showGoods: function (goods) { return publishGoods(id, headers, goods, state.campaign); },
          roll: publishRoll
        });
        save();
        return;
      }
      if (kind === "battle" && window.ShirmoBattle) {
        const fight = window.ShirmoBattle.ensure(state.campaign);
        if (fight.screen == null) fight.screen = true;
        window.ShirmoBattle.mount(battleHost, {
          campaign: state.campaign,
          save: save,
          library: shelf,
          upload: function (file) { return uploadFile(id, key, file); },
          roll: publishRoll,
          place: placeFoes
        });
        save();
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
          showGoods: function (goods) { return publishGoods(id, headers, goods, state.campaign); },
          hideGoods: function () { return hidePlayerGoods(id, headers); },
          shopFont: function () { return pushShopFont(id, headers, state.campaign); },
          showImage: function (url) {
            return api("/api/rooms/" + id + "/events", {
              method: "POST",
              headers: headers,
              body: JSON.stringify({ type: "map-image", url: url })
            });
          },
          hideImage: function () {
            return api("/api/rooms/" + id + "/events", {
              method: "POST",
              headers: headers,
              body: JSON.stringify({ type: "map-image-hide" })
            });
          },
          roll: publishRoll,
          openBattle: function (markerId) {
            const fight = window.ShirmoBattle && window.ShirmoBattle.ensure(state.campaign);
            if (fight) fight.screen = true;
            showModule("battle");
            if (!markerId) return;
            const host = app.querySelector("#work-battle");
            if (host && host._battleFocus) host._battleFocus(markerId);
          },
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
    window.ShirmoShelf.library = function () {
      return { images: shelf().images || [], notes: shelf().notes || [] };
    };
    window.ShirmoShelf.arm(app);
    app.querySelector("#library").addEventListener("click", function () { showModule("library"); });
    app.querySelector("#mod-scene").addEventListener("click", function () { showModule("scene"); });
    app.querySelector("#mod-map").addEventListener("click", function () { showModule("map"); });
    app.querySelector("#mod-codex").addEventListener("click", function () { showModule("codex"); });
    app.querySelector("#mod-battle").addEventListener("click", function () { showModule("battle"); });
    app.querySelector("#mod-library").addEventListener("click", function () { showModule("library"); });

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
      if (app.querySelector("#work-battle").hidden && state.campaign.battle) state.campaign.battle.screen = false;
      if (state.campaign.dungeon) delete state.campaign.dungeon;
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
    mountDock();
    function mountDock() {
      const root = app.querySelector("#dock");
      if (!root || root._dock) return;
      root._dock = true;
      let rollOpen = false;
      let heroOpen = false;
      let noteOpen = false;
      let noteTimer = 0;
      let rollSides = 20;
      const folds = { rolls: true, heroes: true, notes: true, spans: true };
      function model() {
        if (!state.campaign.dock || typeof state.campaign.dock !== "object") state.campaign.dock = {};
        const dock = state.campaign.dock;
        if (typeof dock.open !== "boolean") dock.open = false;
        dock.heroes = Array.isArray(dock.heroes) ? dock.heroes : [];
        dock.notes = Array.isArray(dock.notes) ? dock.notes : [];
        dock.spans = Array.isArray(dock.spans) ? dock.spans : [];
        return dock;
      }
      function heroes() {
        return (state.campaign.codex && state.campaign.codex.heroes) || [];
      }
      function notes() {
        return shelf().notes || [];
      }
      function pinFormula(pin) {
        const sign = modSign(modOf(pin.mod));
        if (pin.mode === "advantage") return "преимущество" + (sign ? " " + sign : "");
        if (pin.mode === "disadvantage") return "помеха" + (sign ? " " + sign : "");
        return (pin.count || 1) + "d" + (pin.sides || 20) + sign;
      }
      function closeHeroRoll() {
        const old = document.getElementById("dock-hero-roll");
        if (old) old.remove();
      }
      function passiveOf(hero, id, names, statId) {
        const skill = (hero.skills || []).find(function (row) {
          if (!row) return false;
          const name = String(row.name || "").trim().toLowerCase();
          return row.id === id || names.indexOf(name) >= 0;
        });
        if (skill) return 10 + Math.round(Number(skill.bonus) || 0);
        const stat = (hero.stats || []).find(function (row) { return row && row.id === statId; });
        return stat ? 10 + Math.round(Number(stat.mod) || 0) : null;
      }
      function openHeroRoll(hero, anchor) {
        closeHeroRoll();
        function signed(n) {
          const v = Math.round(Number(n) || 0);
          return (v > 0 ? "+" : "") + v;
        }
        const stats = hero.stats || [];
        const skills = hero.skills || [];
        const saves = stats.map(function (stat, index) {
          const bonus = stat.save != null ? stat.save : stat.mod;
          return '<button type="button" class="hero-stat" data-roll="save" data-i="' + index + '"><em>' + esc(stat.name || "") + "</em><b>" + signed(bonus) + "</b></button>";
        }).join("");
        const skillHtml = skills.map(function (skill, index) {
          return '<button type="button" class="hero-skill" data-roll="skill" data-i="' + index + '"><span>' + esc(skill.name || "Навык") + "</span><b>" + signed(skill.bonus) + "</b></button>";
        }).join("");
        const menu = document.createElement("div");
        menu.id = "dock-hero-roll";
        menu.className = "pin-menu hero-roll";
        menu.innerHTML = "<h3>" + esc(hero.name || "Герой") + "</h3>" +
          (saves ? '<p class="roll-cap">Спасброски</p><div class="hero-stats">' + saves + "</div>" : "") +
          (skillHtml ? '<p class="roll-cap">Навыки</p><div class="hero-skills">' + skillHtml + "</div>" : "") +
          (!saves && !skillHtml ? '<p class="note">В листе нет характеристик и навыков.</p>' : "");
        const rect = anchor.getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(rect.left - 270, window.innerWidth - 276)) + "px";
        menu.style.top = Math.max(8, Math.min(rect.top, window.innerHeight - 280)) + "px";
        document.body.appendChild(menu);
        menu.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
        menu.addEventListener("click", function (event) {
          const button = event.target.closest("[data-roll]");
          if (!button) return;
          const index = Number(button.getAttribute("data-i"));
          const kind = button.getAttribute("data-roll");
          const row = kind === "save" ? stats[index] : skills[index];
          if (!row) return;
          const bonus = kind === "save" ? (row.save != null ? row.save : row.mod) : row.bonus;
          publishRoll({
            name: hero.name || "Герой",
            label: kind === "save" ? ("Спас " + (row.name || "")) : (row.name || "Навык"),
            sides: 20,
            count: 1,
            mod: Math.round(Number(bonus) || 0)
          });
        });
      }
      function paint() {
        const dock = model();
        const editing = root.querySelector("[data-dock-note]:focus, [data-dock-name]:focus, .dock-form :focus");
        if (editing) return;
        ["rolls", "heroes", "notes", "spans"].forEach(function (name) {
          const node = root.querySelector('[data-fold="' + name + '"]');
          if (node) folds[name] = node.open;
        });
        closeHeroRoll();
        root.classList.toggle("is-shut", !dock.open);
        const layer = document.getElementById("clock-layer");
        const clockOn = !!(layer && layer.classList.contains("is-pinned") && !layer.hidden);
        const clockLabel = clockOn ? "Открепить часы" : "Закрепить часы";
        const timerLayer = document.getElementById("timer-layer");
        const timerOn = !!(timerLayer && timerLayer.classList.contains("is-pinned") && !timerLayer.hidden);
        const timerLabel = timerOn ? "Открепить таймер" : "Закрепить таймер";
        const pinSvg = glyph('<path d="M9 4.5h6l-.8 5.2 2.8 1.8v2H7v-2l2.8-1.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 13.5V20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>');
        const timerSvg = glyph('<circle cx="12" cy="13" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 13V9.5M9.5 4h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>');
        const toggle = '<button type="button" class="dock-toggle" data-dock="toggle" title="' + (dock.open ? "Свернуть стол" : "Открыть стол") + '" aria-expanded="' + (dock.open ? "true" : "false") + '">' + (dock.open ? "»" : "Стол") + "</button>";
        const rail = '<div class="dock-rail"><button type="button" class="dock-pin' + (clockOn ? " is-on" : "") + '" data-dock="clock" title="' + clockLabel + '" aria-label="' + clockLabel + '">' + pinSvg + '</button><button type="button" class="dock-pin' + (timerOn ? " is-on" : "") + '" data-dock="timer" title="' + timerLabel + '" aria-label="' + timerLabel + '">' + timerSvg + "</button>" + toggle + "</div>";
        if (!dock.open) {
          root.innerHTML = rail;
          bind();
          return;
        }
        const rollRows = (state.pins || []).map(function (pin) {
          return '<div class="dock-line"><button type="button" data-dock-throw="' + esc(pin.id) + '">' + esc(pin.name || "Бросок") + " — " + esc(pinFormula(pin)) + "</button>" +
            '<button type="button" data-dock-unpin-roll="' + esc(pin.id) + '" title="Убрать бросок" aria-label="Убрать бросок">×</button></div>';
        }).join("") || '<p class="note">Нет закреплённых бросков.</p>';
        const dice = [4, 6, 8, 10, 12, 20, 100].map(function (n) {
          return '<option value="' + n + '"' + (n === rollSides ? " selected" : "") + ">d" + n + "</option>";
        }).join("");
        const rollForm = rollOpen
          ? '<div class="dock-form"><label>Название<input data-dock-roll-name type="text" placeholder="Атака"></label>' +
            '<div class="row"><label>Кости<input data-dock-roll-count type="number" min="1" max="12" value="1"></label>' +
            '<label>Грань<select data-dock-roll-sides>' + dice + "</select></label>" +
            '<label>Мод<input data-dock-roll-mod type="number" value="0"></label></div>' +
            '<label class="check"><input data-dock-roll-adv type="checkbox"> Преимущество</label>' +
            '<label class="check"><input data-dock-roll-dis type="checkbox"> Помеха</label>' +
            '<div class="row"><button type="button" data-dock="roll-throw">Бросить</button><button type="button" data-dock="roll-save">Закрепить</button></div></div>'
          : "";
        const pinnedHeroes = dock.heroes.map(function (hid) {
          return heroes().find(function (row) { return row && row.id === hid; });
        }).filter(Boolean);
        const heroRows = pinnedHeroes.map(function (hero) {
          const face = hero.portrait ? '<img alt="" src="' + esc(hero.portrait) + '">' : "<i></i>";
          const pp = passiveOf(hero, "perception", ["восприятие", "внимательность"], "wis");
          const pi = passiveOf(hero, "investigation", ["анализ", "расследование"], "int");
          const bits = ["КД " + (Math.round(Number(hero.ac) || 0)), hero.hp != null ? "ХП " + Math.round(Number(hero.hp) || 0) : "", pp != null ? "ВС " + pp : "", pi != null ? "АН " + pi : ""].filter(Boolean).join(" · ");
          return '<div class="dock-line"><button type="button" class="dock-hero" data-dock-hero="' + esc(hero.id) + '">' + face + "<span><b>" + esc(hero.name || "Герой") + "</b><small>" + esc(bits) + "</small></span></button>" +
            '<button type="button" data-dock-unpin-hero="' + esc(hero.id) + '" title="Убрать героя" aria-label="Убрать героя">×</button></div>';
        }).join("") || '<p class="note">Нет закреплённых героев.</p>';
        const freeHeroes = heroes().filter(function (hero) { return hero && dock.heroes.indexOf(hero.id) < 0; });
        const heroForm = heroOpen
          ? (freeHeroes.length
            ? '<div class="dock-picks">' + freeHeroes.map(function (hero) {
              return '<button type="button" data-dock-add-hero="' + esc(hero.id) + '">' + esc(hero.name || "Герой") + "</button>";
            }).join("") + "</div>"
            : '<p class="note">Все герои уже закреплены или справочник пуст.</p>')
          : "";
        const pinnedNotes = dock.notes.map(function (nid) {
          return notes().find(function (row) { return row && row.id === nid; });
        }).filter(Boolean);
        const noteRows = pinnedNotes.map(function (note) {
          return '<article class="dock-note"><div class="dock-line"><input data-dock-name="' + esc(note.id) + '" type="text" value="' + esc(note.name || "") + '" aria-label="Название заметки">' +
            '<button type="button" data-dock-unpin-note="' + esc(note.id) + '" title="Убрать из панели. В библиотеке заметка останется" aria-label="Убрать заметку">×</button></div>' +
            '<textarea data-dock-note="' + esc(note.id) + '" aria-label="Текст заметки">' + esc(note.text || "") + "</textarea></article>";
        }).join("") || '<p class="note">Нет заметок на панели.</p>';
        const freeNotes = notes().filter(function (note) { return note && dock.notes.indexOf(note.id) < 0; });
        const noteForm = noteOpen
          ? '<div class="dock-form"><label>Из библиотеки<select data-dock-note-pick data-shelf="note"><option value="">Выберите заметку</option>' +
            freeNotes.map(function (note) { return '<option value="' + esc(note.id) + '">' + esc(note.name || "Заметка") + "</option>"; }).join("") +
            "</select></label>" +
            '<button type="button" data-dock="note-take">Взять</button>' +
            '<label>Новая<input data-dock-new-name type="text" placeholder="Название"></label>' +
            '<textarea data-dock-new-text placeholder="Текст"></textarea>' +
            '<button type="button" data-dock="note-create">Добавить в библиотеку</button></div>'
          : "";
        function spanLabel(sec) {
          const total = Math.max(0, Math.round(Number(sec) || 0));
          const minutes = Math.floor(total / 60);
          const seconds = total % 60;
          return minutes + ":" + String(seconds).padStart(2, "0");
        }
        const spanRows = (dock.spans || []).map(function (row) {
          return '<div class="dock-line"><button type="button" data-dock="span" data-sec="' + esc(String(row.sec || 0)) + '">' + esc(row.name || spanLabel(row.sec)) + "</button>" +
            '<button type="button" data-dock-span-del="' + esc(row.id) + '" title="Убрать интервал" aria-label="Убрать интервал">×</button></div>';
        }).join("") || '<p class="note">Нет закреплённых интервалов.</p>';
        root.innerHTML = rail + '<div class="dock-main"><div class="dock-body">' +
          '<details class="dock-fold" data-fold="rolls"' + (folds.rolls ? " open" : "") + "><summary>Броски</summary>" + rollRows +
          '<button type="button" data-dock="roll-add">' + (rollOpen ? "Скрыть форму" : "Закрепить бросок") + "</button>" + rollForm + "</details>" +
          '<details class="dock-fold" data-fold="spans"' + (folds.spans ? " open" : "") + "><summary>Интервалы</summary>" + spanRows +
          '<div class="dock-form dock-span"><label>мин<input data-span-min class="num" type="number" min="0" value="1" aria-label="Минуты"></label>' +
          '<label>сек<input data-span-sec class="num" type="number" min="0" max="59" value="0" aria-label="Секунды"></label>' +
          '<button type="button" data-dock="span-add">Закрепить</button></div></details>' +
          '<details class="dock-fold" data-fold="heroes"' + (folds.heroes ? " open" : "") + "><summary>Герои</summary>" + heroRows +
          '<button type="button" data-dock="hero-add">' + (heroOpen ? "Скрыть список" : "Закрепить героя") + "</button>" + heroForm + "</details>" +
          '<details class="dock-fold" data-fold="notes"' + (folds.notes ? " open" : "") + "><summary>Заметки</summary>" + noteRows +
          '<button type="button" data-dock="note-add">' + (noteOpen ? "Скрыть" : "Из библиотеки или новая") + "</button>" + noteForm + "</details>" +
          "</div></div>";
        if (window.ShirmoShelf) window.ShirmoShelf.arm(root);
        const notePick = root.querySelector("[data-dock-note-pick]");
        if (notePick) notePick.addEventListener("change", function () {
          if (!notePick.value) return;
          const take = root.querySelector("[data-dock=note-take]");
          if (take) take.click();
        });
        bind();
      }
      function rollSpec() {
        const adv = root.querySelector("[data-dock-roll-adv]");
        const dis = root.querySelector("[data-dock-roll-dis]");
        const mode = adv && adv.checked ? "advantage" : dis && dis.checked ? "disadvantage" : "normal";
        const sides = Number(root.querySelector("[data-dock-roll-sides]").value) || 20;
        rollSides = sides;
        const count = Number(root.querySelector("[data-dock-roll-count]").value) || 1;
        const mod = modOf(root.querySelector("[data-dock-roll-mod]").value);
        const sign = modSign(mod);
        const name = (root.querySelector("[data-dock-roll-name]").value || "").trim() || ((mode === "advantage" ? "Преимущество" : mode === "disadvantage" ? "Помеха" : count + "d" + sides) + sign);
        return { name: name, label: name, count: count, sides: sides, mode: mode, mod: mod };
      }
      async function saveRoll(spec) {
        const data = await api("/api/rooms/" + id + "/pins", {
          method: "POST",
          headers: headers,
          body: JSON.stringify(spec)
        });
        state.pins = data.pins || [];
      }
      async function dropRoll(pinId) {
        const data = await api("/api/rooms/" + id + "/pins/" + pinId, { method: "DELETE", headers: headers });
        state.pins = data.pins || [];
      }
      function bind() {
        root.onclick = function (event) {
          const button = event.target.closest("button");
          if (!button || !root.contains(button)) return;
          const act = button.getAttribute("data-dock");
          const dock = model();
          if (act === "span-add") {
            const minutes = Math.max(0, Math.round(Number((root.querySelector("[data-span-min]") || {}).value) || 0));
            const seconds = Math.max(0, Math.min(59, Math.round(Number((root.querySelector("[data-span-sec]") || {}).value) || 0)));
            const total = minutes * 60 + seconds;
            if (!total) return;
            const label = minutes + ":" + String(seconds).padStart(2, "0");
            dock.spans.unshift({ id: crypto.randomUUID(), sec: total, name: label });
            save();
            paint();
            return;
          }
          if (act === "span") {
            const sec = Math.round(Number(button.getAttribute("data-sec")) || 0);
            if (!sec) return;
            openTimer(timerBag());
            if (window.ShirmoClock && window.ShirmoClock.arm) window.ShirmoClock.arm(sec);
            return;
          }
          if (button.hasAttribute("data-dock-span-del")) {
            const sid = button.getAttribute("data-dock-span-del");
            dock.spans = dock.spans.filter(function (row) { return row.id !== sid; });
            save();
            paint();
            return;
          }
          if (act === "toggle") {
            dock.open = !dock.open;
            save();
            paint();
            window.dispatchEvent(new Event("resize"));
            return;
          }
          if (act === "clock") {
            const layer = document.getElementById("clock-layer");
            const held = layer && layer.classList.contains("is-pinned") && !layer.hidden;
            if (held) {
              openClock({ unpin: true, roomId: id, headers: headers });
              paint();
              return;
            }
            if (!dock.open) {
              dock.open = true;
              save();
            }
            openClock({ pin: true, roomId: id, headers: headers });
            paint();
            return;
          }
          if (act === "timer") {
            const layer = document.getElementById("timer-layer");
            const held = layer && layer.classList.contains("is-pinned") && !layer.hidden;
            if (held) {
              openTimer(timerBag({ unpin: true }));
              paint();
              return;
            }
            if (!dock.open) {
              dock.open = true;
              save();
            }
            openTimer(timerBag({ pin: true }));
            paint();
            return;
          }
          if (act === "roll-add") { rollOpen = !rollOpen; paint(); return; }
          if (act === "hero-add") { heroOpen = !heroOpen; paint(); return; }
          if (act === "note-add") { noteOpen = !noteOpen; paint(); return; }
          if (button.hasAttribute("data-dock-throw")) {
            const pin = (state.pins || []).find(function (row) { return row.id === button.getAttribute("data-dock-throw"); });
            if (pin) publishRoll(pin);
            return;
          }
          if (button.hasAttribute("data-dock-unpin-roll")) {
            dropRoll(button.getAttribute("data-dock-unpin-roll")).then(paint, function (error) { err.textContent = error.message; });
            return;
          }
          if (act === "roll-throw" || act === "roll-save") {
            const spec = rollSpec();
            if (act === "roll-throw") publishRoll(spec);
            if (act === "roll-save") saveRoll(spec).then(function () { rollOpen = false; paint(); }, function (error) { err.textContent = error.message; });
            return;
          }
          if (button.hasAttribute("data-dock-hero")) {
            const hero = heroes().find(function (row) { return row && row.id === button.getAttribute("data-dock-hero"); });
            if (hero) openHeroRoll(hero, button);
            return;
          }
          if (button.hasAttribute("data-dock-add-hero")) {
            const hid = button.getAttribute("data-dock-add-hero");
            if (dock.heroes.indexOf(hid) < 0) dock.heroes.unshift(hid);
            heroOpen = false;
            save();
            paint();
            return;
          }
          if (button.hasAttribute("data-dock-unpin-hero")) {
            const hid = button.getAttribute("data-dock-unpin-hero");
            dock.heroes = dock.heroes.filter(function (row) { return row !== hid; });
            save();
            paint();
            return;
          }
          if (act === "note-take") {
            const pick = root.querySelector("[data-dock-note-pick]");
            const nid = pick && pick.value;
            if (nid && dock.notes.indexOf(nid) < 0) dock.notes.unshift(nid);
            noteOpen = false;
            save();
            paint();
            return;
          }
          if (act === "note-create") {
            const name = (root.querySelector("[data-dock-new-name]").value || "").trim() || "Заметка";
            const text = root.querySelector("[data-dock-new-text]").value || "";
            const note = { id: crypto.randomUUID(), name: name, text: text };
            shelf().notes.push(note);
            dock.notes.unshift(note.id);
            noteOpen = false;
            save();
            paint();
            return;
          }
          if (button.hasAttribute("data-dock-unpin-note")) {
            const nid = button.getAttribute("data-dock-unpin-note");
            dock.notes = dock.notes.filter(function (row) { return row !== nid; });
            save();
            paint();
          }
        };
        root.querySelectorAll("[data-dock-note], [data-dock-name]").forEach(function (field) {
          field.addEventListener("input", function () {
            const nid = field.getAttribute("data-dock-note") || field.getAttribute("data-dock-name");
            const note = notes().find(function (row) { return row && row.id === nid; });
            if (!note) return;
            if (field.hasAttribute("data-dock-note")) note.text = field.value;
            else note.name = field.value;
            clearTimeout(noteTimer);
            noteTimer = setTimeout(save, 400);
          });
        });
        const adv = root.querySelector("[data-dock-roll-adv]");
        const dis = root.querySelector("[data-dock-roll-dis]");
        if (adv && dis) {
          adv.addEventListener("change", function () { if (adv.checked) dis.checked = false; });
          dis.addEventListener("change", function () { if (dis.checked) adv.checked = false; });
        }
      }
      window.ShirmoDock = { paint: paint };
      document.addEventListener("pointerdown", function (event) {
        const menu = document.getElementById("dock-hero-roll");
        if (!menu || menu.contains(event.target)) return;
        if (event.target.closest && event.target.closest("[data-dock-hero]")) return;
        closeHeroRoll();
      });
      paint();
    }
    const kebabBtn = app.querySelector("#top-kebab");
    const kebabMenu = app.querySelector("#kebab-menu");
    function setKebab(open) {
      kebabMenu.hidden = !open;
      kebabBtn.setAttribute("aria-expanded", open ? "true" : "false");
    }
    kebabBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      setKebab(kebabMenu.hidden);
    });
    kebabMenu.addEventListener("click", function () { setKebab(false); });
    document.addEventListener("click", function () { setKebab(false); });
    app.querySelector("#roll").addEventListener("click", function () {
      const look = document.getElementById("roll-look-menu");
      if (look && look._close) look._close();
      openRollMenu(id, headers, state, err, app.querySelector("#roll"));
    });
    app.querySelector("#clock-open").addEventListener("click", function () { openClock({ roomId: id, headers: headers }); });
    app.querySelector("#timer-open").addEventListener("click", function () {
      openTimer(timerBag());
    });
    app.querySelector("#roll-look").addEventListener("click", function () {
      openRollLook(state, err, save, app.querySelector("#roll-look"));
    });
    app.querySelector("#backup").addEventListener("click", async function () {
      const btn = app.querySelector("#backup");
      if (btn.disabled) return;
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = "Выгрузка…";
      try {
        err.textContent = "";
        await downloadBackup("/api/rooms/" + id + "/backup", { authorization: headers.authorization });
      } catch (fail) {
        backupToast(fail.message || "ошибка выгрузки", "err");
        err.textContent = fail.message;
        setTimeout(function () { backupToast(""); }, 4000);
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    });
    app.querySelector("#pass").addEventListener("click", async function () {
      const next = window.prompt("Новый пароль мастера (от 4 символов)");
      if (!next) return;
      try {
        const res = await api("/api/rooms/" + id + "/password", {
          method: "POST",
          headers: headers,
          body: JSON.stringify({ password: next, oldPassword: key })
        });
        key = res.masterKey;
        sessionStorage.setItem(keyName(id), key);
        rememberRoom({ id: id, key: key, title: state.title });
        headers.authorization = "Bearer " + key;
        window.alert("Пароль обновлён.");
      } catch (fail) {
        err.textContent = fail.message;
      }
    });
    app.querySelector("#copy-master").addEventListener("click", function () {
      navigator.clipboard.writeText(location.origin + "/m/" + id + "?k=" + encodeURIComponent(key));
    });
    app.querySelector("#copy").addEventListener("click", function () {
      navigator.clipboard.writeText(viewerUrl);
    });
    function applyPlay(data) {
      if (data.op === "enter") {
        const pages = state.campaign.pages || [];
        const mapPage = pages.find(function (item) { return item && item.kind === "map" && item.id === state.campaign.shownPageId; })
          || pages.find(function (item) { return item && item.kind === "map"; });
        if (!mapPage || !mapPage.views) return;
        const mapView = mapPage.views.find(function (item) { return item && item.id === mapPage.activeViewId; }) || mapPage.views[0];
        if (!mapView) return;
        mapView.focusId = data && data.id || "";
        mapView.talkId = "";
        if (window.ShirmoMap && window.ShirmoMap.sync) window.ShirmoMap.sync();
        return;
      }
      if (data.op === "fight" && window.ShirmoBattle) {
        const fight = window.ShirmoBattle.ensure(state.campaign);
        fight.screen = true;
        data = { op: "turn", id: data.actorId || "" };
        if (!data.id) {
          if (window.ShirmoBattle.sync) window.ShirmoBattle.sync();
          return;
        }
      }
      if (data.op !== "turn") return;
      const battle = state.campaign.battle;
      if (!battle || !Array.isArray(battle.actors)) return;
      const list = battle.actors.map(function (actor, index) { return { actor: actor, index: index }; }).filter(function (row) {
        return row.actor && String(row.actor.name || "").trim();
      }).sort(function (a, b) {
        const diff = (Number(b.actor.init) || 0) - (Number(a.actor.init) || 0);
        return diff || a.index - b.index;
      });
      const at = list.findIndex(function (row) { return row.actor.id === data.id; });
      if (at < 0) return;
      battle.turn = at;
      if (window.ShirmoBattle && window.ShirmoBattle.sync) window.ShirmoBattle.sync();
    }
    const playSource = new EventSource("/api/rooms/" + id + "/events");
    playSource.onmessage = function (message) {
      let data = null;
      try { data = JSON.parse(message.data); } catch (err) { return; }
      if (!data || data.type !== "play") return;
      applyPlay(data);
    };
    window.addEventListener("pagehide", function () { playSource.close(); });
    if (window.ShirmoCodex && window.ShirmoCodex.adopt(state.campaign)) save();
    let open = page().kind === "map" ? "map" : "scene";
    try {
      const saved = sessionStorage.getItem("shirmo-mod-" + id);
      if (saved === "scene" || saved === "map" || saved === "codex" || saved === "battle" || saved === "library") open = saved;
    } catch (err) { /* нет хранилища */ }
    showModule(open);
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

  function dataUrlBlob(text) {
    const match = String(text || "").match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i);
    if (!match) return null;
    try {
      const bin = atob(match[2].replace(/\s/g, ""));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: match[1] });
    } catch (err) {
      return null;
    }
  }

  function localPicture(value) {
    const text = String(value || "").trim();
    return text.charAt(0) === "/" && text.indexOf("..") < 0 ? text : "";
  }

  async function stashPortraits(campaign, upload) {
    if (!campaign || !upload) return;
    const cache = {};
    async function toFile(value, label) {
      const text = String(value || "").trim();
      if (!text) return "";
      const local = localPicture(text);
      if (local) return local;
      if (cache[text]) return cache[text];
      cache[text] = (async function () {
        let blob = null;
        if (text.indexOf("data:image/") === 0) blob = dataUrlBlob(text);
        else if (/^https?:\/\//i.test(text)) {
          try {
            const res = await fetch(text);
            if (res.ok) blob = await res.blob();
          } catch (err) { blob = null; }
        }
        if (!blob) return text;
        const type = blob.type && blob.type.indexOf("image/") === 0 ? blob.type : "image/jpeg";
        const ext = (type.split("/")[1] || "jpg").replace("jpeg", "jpg");
        try {
          return await upload(new File([blob], (label || "portrait") + "." + ext, { type: type }));
        } catch (err) {
          return text;
        }
      })();
      return cache[text];
    }
    function queue(row, key, label) {
      if (!row || !row[key]) return Promise.resolve();
      if (localPicture(row[key])) return Promise.resolve();
      return toFile(row[key], label).then(function (url) {
        if (url) row[key] = url;
      });
    }
    const book = campaign.codex || {};
    const heroes = book.heroes || [];
    (campaign.battle && campaign.battle.actors || []).forEach(function (actor) {
      if (!actor || actor.portrait) return;
      const hero = actor.heroId && heroes.find(function (row) { return row && row.id === actor.heroId; });
      const npc = actor.codexId && (book.npcs || []).find(function (row) { return row && row.id === actor.codexId; });
      actor.portrait = (hero && hero.portrait) || (npc && npc.portrait) || "";
    });
    const jobs = [];
    heroes.forEach(function (row, i) { jobs.push(queue(row, "portrait", (row && row.name) || ("hero-" + i))); });
    (book.npcs || []).forEach(function (row, i) { jobs.push(queue(row, "portrait", (row && row.name) || ("npc-" + i))); });
    ((campaign.battle && campaign.battle.actors) || []).forEach(function (row, i) {
      jobs.push(queue(row, "portrait", (row && row.name) || ("actor-" + i)));
    });
    (campaign.pages || []).forEach(function (page) {
      (page.views || []).forEach(function (view) {
        (view.markers || []).forEach(function (row, i) {
          jobs.push(queue(row, "portrait", (row && row.name) || ("mark-" + i)));
        });
      });
    });
    await Promise.all(jobs);
  }

  function mountLibrary(host, ctx) {
    if (!host || !ctx) return;
    let kind = host._libKind || "images";
    let path = host._libPath == null ? "" : host._libPath;
    let query = host._libQuery || "";
    let sort = host._libSort || "name";
    let selected = host._libSelected || "";
    let unusedOnly = !!host._libUnused;
    let menu = null;

    function rawList(lib) {
      if (kind === "fonts") return lib.fonts || [];
      if (kind === "notes") return lib.notes || [];
      return lib.images || [];
    }

    function folderOf(item) {
      if (kind !== "images") return "";
      if (item.folder != null && String(item.folder) !== "") return String(item.folder).replace(/^\/+|\/+$/g, "");
      const title = ctx.sectionOf ? ctx.sectionOf(item) : (item.section || "Общее");
      item.folder = title === "Все" ? "" : title;
      return item.folder;
    }

    function ensureFolders(lib) {
      if (!Array.isArray(lib.folders)) lib.folders = [];
      const set = {};
      lib.folders.forEach(function (p) { if (p) set[p] = true; });
      (lib.images || []).forEach(function (item) {
        const parts = folderOf(item).split("/").filter(Boolean);
        let acc = "";
        parts.forEach(function (part) {
          acc = acc ? acc + "/" + part : part;
          set[acc] = true;
        });
      });
      lib.folders = Object.keys(set).sort(function (a, b) { return a.localeCompare(b, "ru"); });
    }

    function childFolders(lib, parent) {
      const prefix = parent ? parent + "/" : "";
      const kids = [];
      const seen = {};
      (lib.folders || []).forEach(function (p) {
        if (!p) return;
        if (parent) {
          if (p === parent || p.indexOf(prefix) !== 0) return;
          const rest = p.slice(prefix.length);
          const name = rest.split("/")[0];
          if (!name || seen[name]) return;
          seen[name] = true;
          kids.push({ name: name, path: prefix + name });
        } else {
          const name = p.split("/")[0];
          if (seen[name]) return;
          seen[name] = true;
          kids.push({ name: name, path: name });
        }
      });
      return kids.sort(function (a, b) { return a.name.localeCompare(b.name, "ru"); });
    }

    function countIn(lib, folderPath) {
      return rawList(lib).filter(function (item) {
        const f = folderOf(item);
        if (!folderPath) return true;
        return f === folderPath || f.indexOf(folderPath + "/") === 0;
      }).length;
    }

    function isAssetUrl(value) {
      if (!value || typeof value !== "string") return false;
      if (value.indexOf("/api/rooms/") === 0) return true;
      if (value.indexOf("blob:") === 0) return true;
      if (value.indexOf("data:image") === 0) return true;
      return /\.(png|jpe?g|gif|webp|svg|woff2?|ttf|otf)(\?|$)/i.test(value);
    }

    function fieldLabel(key) {
      const names = {
        portrait: "портрет", image: "картинка", url: "файл", icon: "иконка",
        backdrop: "фон", day: "день", night: "ночь", fontUrl: "шрифт",
        portraitThumb: "миниатюра"
      };
      return names[key] || key;
    }

    function usageIndex() {
      const acc = {};
      const campaign = ctx.campaign;
      if (!campaign) return acc;
      function add(url, label) {
        if (!isAssetUrl(url)) return;
        if (!acc[url]) acc[url] = [];
        if (acc[url].indexOf(label) < 0) acc[url].push(label);
      }
      function walk(node, hint) {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) {
          node.forEach(function (row) {
            const name = row && (row.name || row.title);
            walk(row, name ? hint + " «" + name + "»" : hint);
          });
          return;
        }
        Object.keys(node).forEach(function (key) {
          if (key === "library" || key === "cells" || key === "explored") return;
          const val = node[key];
          if (typeof val === "string") {
            if (isAssetUrl(val)) add(val, hint + " — " + fieldLabel(key));
          } else if (val && typeof val === "object") {
            walk(val, hint);
          }
        });
      }
      (campaign.pages || []).forEach(function (page) {
        walk(page, page.kind === "map" ? "Карта" : ("Сцена «" + (page.name || page.title || "") + "»"));
      });
      walk(campaign.codex, "Справочник");
      walk(campaign.battle, "Бой");
      walk(campaign.stage, "Сцена");
      return acc;
    }

    function usesOf(item, index) {
      if (!item) return [];
      if (item.url) return index[item.url] || [];
      return [];
    }

    function hideMenu() {
      if (menu) menu.remove();
      menu = null;
    }

    function showMenu(x, y, items) {
      hideMenu();
      menu = document.createElement("div");
      menu.className = "libx-menu";
      menu.innerHTML = items.map(function (row) {
        return '<button type="button" data-act="' + esc(row.act) + '">' + esc(row.label) + "</button>";
      }).join("");
      document.body.appendChild(menu);
      const w = menu.offsetWidth;
      const h = menu.offsetHeight;
      menu.style.left = Math.min(x, window.innerWidth - w - 8) + "px";
      menu.style.top = Math.min(y, window.innerHeight - h - 8) + "px";
      menu.addEventListener("click", function (event) {
        const btn = event.target.closest("[data-act]");
        if (!btn) return;
        const act = btn.getAttribute("data-act");
        hideMenu();
        const hit = items.find(function (row) { return row.act === act; });
        if (hit && hit.run) hit.run();
      });
    }

    function pickFolder(title, current, done) {
      const lib = ctx.shelf();
      ensureFolders(lib);
      const options = [""].concat(lib.folders || []).map(function (p) {
        const label = p || "(корень)";
        return '<option value="' + esc(p) + '"' + (p === current ? " selected" : "") + ">" + esc(label) + "</option>";
      }).join("");
      const box = document.createElement("div");
      box.className = "libx-dialog";
      box.innerHTML = "<h3>" + esc(title) + "</h3>" +
        "<label>Папка<select>" + options + "</select></label>" +
        '<label>Новая папка<input type="text" placeholder="Например Герои/Портреты"></label>' +
        '<div class="libx-dialog-acts"><button type="button" data-ok class="primary">Ок</button>' +
        '<button type="button" data-cancel>Отмена</button></div>';
      host.appendChild(box);
      function close() { box.remove(); }
      box.querySelector("[data-cancel]").addEventListener("click", close);
      box.querySelector("[data-ok]").addEventListener("click", function () {
        const typed = box.querySelector("input").value.trim().replace(/^\/+|\/+$/g, "").replace(/\\/g, "/");
        const chosen = typed || box.querySelector("select").value;
        close();
        done(chosen);
      });
    }

    function setItemFolder(item, next) {
      item.folder = next || "";
      if (kind === "images") {
        item.section = next || "Общее";
        item.sectionName = next.split("/").pop() || "Общее";
      }
    }

    function deleteItem(id) {
      const shelf = ctx.shelf();
      shelf[kind] = (shelf[kind] || []).filter(function (item) { return item.id !== id; });
      if (selected === id) selected = "";
      ctx.save();
      if (ctx.fill) ctx.fill();
      paint();
    }

    function deleteFolder(folderPath) {
      if (!folderPath) return;
      const lib = ctx.shelf();
      const parent = folderPath.split("/").slice(0, -1).join("/");
      rawList(lib).forEach(function (item) {
        const f = folderOf(item);
        if (f === folderPath) setItemFolder(item, parent);
        else if (f.indexOf(folderPath + "/") === 0) setItemFolder(item, parent ? parent + f.slice(folderPath.length) : f.slice(folderPath.length + 1));
      });
      lib.folders = (lib.folders || []).filter(function (p) {
        return p !== folderPath && p.indexOf(folderPath + "/") !== 0;
      });
      if (path === folderPath || path.indexOf(folderPath + "/") === 0) path = parent;
      ctx.save();
      paint();
    }

    function moveItems(ids, next) {
      const lib = ctx.shelf();
      ensureFolders(lib);
      if (next && lib.folders.indexOf(next) < 0) lib.folders.push(next);
      rawList(lib).forEach(function (item) {
        if (ids.indexOf(item.id) >= 0) setItemFolder(item, next);
      });
      ctx.save();
      paint();
    }

    function moveFolder(from, to) {
      if (!from || from === to) return;
      if (to === from || (to && to.indexOf(from + "/") === 0)) return;
      const lib = ctx.shelf();
      const name = from.split("/").pop();
      const dest = to ? to + "/" + name : name;
      rawList(lib).forEach(function (item) {
        const f = folderOf(item);
        if (f === from) setItemFolder(item, dest);
        else if (f.indexOf(from + "/") === 0) setItemFolder(item, dest + f.slice(from.length));
      });
      lib.folders = (lib.folders || []).map(function (p) {
        if (p === from) return dest;
        if (p.indexOf(from + "/") === 0) return dest + p.slice(from.length);
        return p;
      });
      if (path === from || path.indexOf(from + "/") === 0) path = dest + path.slice(from.length);
      ctx.save();
      paint();
    }

    function listItems(lib, used) {
      const q = String(query || "").trim().toLowerCase();
      let rows = rawList(lib).filter(function (item) {
        const f = folderOf(item);
        if (!q && kind === "images" && f !== path) return false;
        if (!q && kind !== "images" && path) return false;
        if (q) {
          const hay = [item.name, item.folder, item.section, item.text].join(" ").toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        if (unusedOnly && usesOf(item, used).length) return false;
        return true;
      });
      rows.sort(function (a, b) {
        if (sort === "folder") {
          const gap = folderOf(a).localeCompare(folderOf(b), "ru");
          return gap || String(a.name || "").localeCompare(String(b.name || ""), "ru");
        }
        if (sort === "new") return String(b.id || "").localeCompare(String(a.id || ""));
        if (sort === "unused") {
          const ua = usesOf(a, used).length ? 1 : 0;
          const ub = usesOf(b, used).length ? 1 : 0;
          return ua - ub || String(a.name || "").localeCompare(String(b.name || ""), "ru");
        }
        return String(a.name || "").localeCompare(String(b.name || ""), "ru");
      });
      return rows;
    }

    function treeHtml(lib) {
      const rows = ['<button type="button" class="libx-tree-item' + (path === "" ? " is-on" : "") + '" data-path="" style="--depth:0"><span class="libx-tree-ico" aria-hidden="true"></span><span>Библиотека</span><em>' + countIn(lib, "") + "</em></button>"];
      (lib.folders || []).forEach(function (p) {
        const depth = p.split("/").length;
        const name = p.split("/").pop();
        const on = path === p ? " is-on" : "";
        const open = path === p || path.indexOf(p + "/") === 0 ? " is-open" : "";
        rows.push('<button type="button" class="libx-tree-item' + on + open + '" data-path="' + esc(p) + '" style="--depth:' + depth + '">' +
          '<span class="libx-tree-ico" aria-hidden="true"></span><span>' + esc(name) + "</span><em>" + countIn(lib, p) + "</em></button>");
      });
      return rows.join("");
    }

    function crumbsHtml() {
      const parts = path ? path.split("/") : [];
      let acc = "";
      let html = '<button type="button" data-path="">Библиотека</button>';
      parts.forEach(function (part) {
        acc = acc ? acc + "/" + part : part;
        html += "<span>/</span><button type=\"button\" data-path=\"" + esc(acc) + "\">" + esc(part) + "</button>";
      });
      return html;
    }

    function paint() {
      hideMenu();
      const lib = ctx.shelf();
      ensureFolders(lib);
      const used = usageIndex();
      const rows = listItems(lib, used);
      if (selected && !rows.some(function (row) { return row.id === selected; })) selected = "";
      const picked = rows.find(function (row) { return row.id === selected; }) || null;
      host._libKind = kind;
      host._libPath = path;
      host._libQuery = query;
      host._libSort = sort;
      host._libSelected = selected;
      host._libUnused = unusedOnly;
      const searching = !!String(query || "").trim();
      const dirs = searching || kind !== "images" ? [] : childFolders(lib, path);
      const unusedCount = rawList(lib).filter(function (item) { return !usesOf(item, used).length; }).length;

      const tree = treeHtml(lib);

      const dirCards = dirs.map(function (dir) {
        return '<button type="button" class="libx-card is-dir" data-open-path="' + esc(dir.path) + '" title="' + esc(dir.path) + '">' +
          '<div class="libx-thumb libx-folder-art" aria-hidden="true"></div>' +
          "<strong>" + esc(dir.name) + "</strong>" +
          "<small>" + countIn(lib, dir.path) + " шт.</small></button>";
      }).join("");
      const fileCards = rows.map(function (item) {
        const hits = usesOf(item, used);
        const thumb = kind === "images" && item.url
          ? '<img alt="" src="' + esc(item.url) + '">'
          : (kind === "fonts"
            ? '<span class="libx-glyph" style="font-family:' + esc(item.name) + ', Georgia, serif">Aa</span>'
            : '<span class="libx-glyph">≡</span>');
        const badge = hits.length
          ? '<span class="libx-badge is-used" title="' + esc(hits.join("\n")) + '">' + hits.length + "</span>"
          : '<span class="libx-badge is-free">не используется</span>';
        return '<button type="button" class="libx-card' + (selected === item.id ? " is-on" : "") + (hits.length ? "" : " is-unused") + '" data-id="' + esc(item.id) + '" title="' + esc(item.name) + '">' +
          '<div class="libx-thumb">' + thumb + badge + "</div>" +
          "<strong>" + esc(item.name || "Без имени") + "</strong>" +
          (kind === "images" ? "<small>" + esc(folderOf(item) || "корень") + "</small>" : "") +
          "</button>";
      }).join("");
      const cards = (dirCards + fileCards) || '<p class="roll-empty libx-empty">Пусто</p>';

      let preview = '<div class="libx-preview-empty">Выбери файл</div>';
      if (picked) {
        if (kind === "images" && picked.url) {
          preview = '<img class="libx-preview-img" alt="" src="' + esc(picked.url) + '">' +
            "<h3>" + esc(picked.name) + "</h3>" +
            "<p>" + esc(folderOf(picked) || "корень") + "</p>" +
            '<a href="' + esc(picked.url) + '" target="_blank" rel="noopener">Открыть оригинал</a>';
        } else if (kind === "fonts") {
          preview = '<p class="libx-font-demo" style="font-family:\'' + esc(picked.name) + '\', Georgia, serif">Съешь ещё этих мягких французских булок</p>' +
            "<h3>" + esc(picked.name) + "</h3>";
        } else {
          preview = "<h3>" + esc(picked.name) + "</h3><pre class=\"libx-note\">" + esc(picked.text || "") + "</pre>";
        }
        const hits = usesOf(picked, used);
        preview += hits.length
          ? '<div class="libx-used"><p>Используется</p><ul>' + hits.map(function (row) { return "<li>" + esc(row) + "</li>"; }).join("") + "</ul></div>"
          : '<p class="libx-unused-note">Нигде не используется</p>';
        preview += '<button type="button" data-lib-move="' + esc(picked.id) + '">Переместить</button>';
        preview += '<button type="button" class="danger" data-lib-del="' + esc(picked.id) + '">Удалить</button>';
      }

      const accept = kind === "fonts"
        ? ".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf"
        : "image/*";
      const addBlock = kind === "notes"
        ? '<div class="libx-add"><input id="lib-note-name" type="text" placeholder="Название заметки">' +
          '<textarea id="lib-note-text" placeholder="Текст"></textarea>' +
          '<button type="button" id="lib-add" class="primary">Добавить заметку</button></div>'
        : '<div class="libx-add"><input id="lib-item-name" type="text" placeholder="Название">' +
          filePick("lib-upload", accept, kind === "fonts" ? "Шрифт" : "Изображение") +
          '<button type="button" id="lib-add" class="primary">Загрузить</button></div>';

      host.innerHTML =
        '<div class="libx">' +
        '<header class="libx-bar">' +
        '<div class="libx-tabs">' +
        '<button type="button" data-kind="images"' + (kind === "images" ? ' class="is-on"' : "") + ">Изображения</button>" +
        '<button type="button" data-kind="fonts"' + (kind === "fonts" ? ' class="is-on"' : "") + ">Шрифты</button>" +
        '<button type="button" data-kind="notes"' + (kind === "notes" ? ' class="is-on"' : "") + ">Заметки</button>" +
        "</div>" +
        '<input id="lib-search" type="search" placeholder="Поиск…" value="' + esc(query) + '" aria-label="Поиск">' +
        '<label class="libx-sort">Сортировка<select id="lib-sort">' +
        '<option value="name"' + (sort === "name" ? " selected" : "") + ">Имя</option>" +
        '<option value="folder"' + (sort === "folder" ? " selected" : "") + ">Папка</option>" +
        '<option value="unused"' + (sort === "unused" ? " selected" : "") + ">Сначала лишние</option>" +
        '<option value="new"' + (sort === "new" ? " selected" : "") + ">Новые</option>" +
        "</select></label>" +
        '<label class="check"><input type="checkbox" id="lib-unused"' + (unusedOnly ? " checked" : "") + "> Только неиспользуемые</label>" +
        '<button type="button" id="lib-new-folder">Новая папка</button>' +
        '<span class="libx-count">' + unusedCount + " лишних · " + rows.length + "</span>" +
        "</header>" +
        '<nav class="libx-crumbs">' + crumbsHtml() + "</nav>" +
        '<aside class="libx-tree">' + tree + "</aside>" +
        '<div class="libx-grid">' + cards + "</div>" +
        '<aside class="libx-preview">' + preview + addBlock + "</aside>" +
        "</div>";

      function goPath(next) {
        path = next || "";
        selected = "";
        paint();
      }
      host.querySelectorAll("[data-kind]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          kind = btn.getAttribute("data-kind");
          path = "";
          selected = "";
          paint();
        });
      });
      host.querySelectorAll("[data-path]").forEach(function (btn) {
        btn.addEventListener("click", function () { goPath(btn.getAttribute("data-path") || ""); });
      });
      host.querySelectorAll("[data-open-path]").forEach(function (btn) {
        btn.addEventListener("dblclick", function () { goPath(btn.getAttribute("data-open-path")); });
        btn.addEventListener("click", function () { selected = ""; });
      });
      host.querySelectorAll("[data-id]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          selected = btn.getAttribute("data-id");
          paint();
        });
      });
      host.querySelector(".libx-grid").addEventListener("contextmenu", function (event) {
        event.stopPropagation();
        const dir = event.target.closest("[data-open-path]");
        const file = event.target.closest("[data-id]");
        if (!dir && !file) return;
        event.preventDefault();
        if (dir) {
          const folderPath = dir.getAttribute("data-open-path");
          showMenu(event.clientX, event.clientY, [
            { act: "open", label: "Открыть", run: function () { goPath(folderPath); } },
            { act: "move", label: "Переместить…", run: function () {
              pickFolder("Переместить папку", path, function (next) { moveFolder(folderPath, next); });
            } },
            { act: "delete", label: "Удалить папку", run: function () {
              if (window.confirm("Удалить папку? Файлы поднимутся выше.")) deleteFolder(folderPath);
            } }
          ]);
          return;
        }
        const id = file.getAttribute("data-id");
        selected = id;
        showMenu(event.clientX, event.clientY, [
          { act: "move", label: "Переместить…", run: function () {
            pickFolder("Переместить файл", folderOf(rawList(ctx.shelf()).find(function (row) { return row.id === id; }) || {}), function (next) {
              moveItems([id], next);
            });
          } },
          { act: "delete", label: "Удалить", run: function () { deleteItem(id); } }
        ]);
      });
      host.querySelector(".libx-tree").addEventListener("contextmenu", function (event) {
        event.stopPropagation();
        const btn = event.target.closest("[data-path]");
        if (!btn) return;
        const folderPath = btn.getAttribute("data-path");
        if (!folderPath) return;
        event.preventDefault();
        showMenu(event.clientX, event.clientY, [
          { act: "move", label: "Переместить…", run: function () {
            pickFolder("Переместить папку", path, function (next) { moveFolder(folderPath, next); });
          } },
          { act: "delete", label: "Удалить папку", run: function () {
            if (window.confirm("Удалить папку? Файлы поднимутся выше.")) deleteFolder(folderPath);
          } }
        ]);
      });
      if (!host._libMenuHide) {
        host._libMenuHide = true;
        document.addEventListener("click", hideMenu);
      }
      const search = host.querySelector("#lib-search");
      if (search) {
        search.addEventListener("input", function () {
          query = search.value;
          paint();
          const again = host.querySelector("#lib-search");
          if (again) {
            again.focus();
            const end = again.value.length;
            try { again.setSelectionRange(end, end); } catch (e) { /* ignore */ }
          }
        });
      }
      const sortEl = host.querySelector("#lib-sort");
      if (sortEl) {
        sortEl.addEventListener("change", function () {
          sort = sortEl.value;
          paint();
        });
      }
      const unusedEl = host.querySelector("#lib-unused");
      if (unusedEl) {
        unusedEl.addEventListener("change", function () {
          unusedOnly = unusedEl.checked;
          paint();
        });
      }
      const newFolder = host.querySelector("#lib-new-folder");
      if (newFolder) {
        newFolder.addEventListener("click", function () {
          const name = window.prompt("Имя папки", "Новая папка");
          if (!name) return;
          const next = (path ? path + "/" : "") + name.trim().replace(/[\\/]+/g, "/");
          const lib = ctx.shelf();
          ensureFolders(lib);
          if (lib.folders.indexOf(next) < 0) lib.folders.push(next);
          ctx.save();
          goPath(next);
        });
      }
      const del = host.querySelector("[data-lib-del]");
      if (del) {
        del.addEventListener("click", function () { deleteItem(del.getAttribute("data-lib-del")); });
      }
      const moveBtn = host.querySelector("[data-lib-move]");
      if (moveBtn) {
        moveBtn.addEventListener("click", function () {
          const id = moveBtn.getAttribute("data-lib-move");
          pickFolder("Переместить файл", path, function (next) { moveItems([id], next); });
        });
      }
      const file = host.querySelector("#lib-upload");
      if (file) {
        file.addEventListener("change", function () {
          const pickedFile = file.files[0];
          const title = host.querySelector("#lib-item-name");
          const slot = host.querySelector("#lib-upload-name");
          if (slot) slot.textContent = pickedFile ? pickedFile.name : "";
          if (title && pickedFile && !title.value) title.value = pickedFile.name.replace(/\.[^.]+$/, "");
        });
      }
      const add = host.querySelector("#lib-add");
      if (add) {
        add.addEventListener("click", async function () {
          try {
            if (kind === "notes") {
              const name = (host.querySelector("#lib-note-name").value || "").trim();
              const text = host.querySelector("#lib-note-text").value || "";
              if (!name) return;
              ctx.shelf().notes.push({ id: crypto.randomUUID(), name: name, text: text });
              selected = ctx.shelf().notes[ctx.shelf().notes.length - 1].id;
            } else {
              const pickedFile = host.querySelector("#lib-upload").files[0];
              const name = (host.querySelector("#lib-item-name").value || "").trim();
              if (!pickedFile || !name) return;
              const url = await ctx.upload(pickedFile);
              const row = { id: crypto.randomUUID(), name: name, url: url, folder: path, section: path || "Общее" };
              if (kind === "images") {
                ctx.shelf().images.push(row);
                selected = row.id;
              } else {
                ctx.shelf().fonts.push(row);
                selected = row.id;
              }
            }
            await ctx.save();
            if (ctx.fill) ctx.fill();
            paint();
          } catch (error) {
            if (ctx.err) ctx.err.textContent = error.message;
          }
        });
      }
    }

    paint();
    host._refresh = paint;
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
  else if (isAdminPage) admin();
  else home();
})();
