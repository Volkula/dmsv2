(function () {
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function blankView(id) {
    return {
      id: id,
      name: "Вид 1",
      day: "",
      night: "",
      mode: "day",
      locations: [],
      markers: [],
      labels: [],
      strokes: []
    };
  }

  function normalize(view) {
    view.locations = view.locations || [];
    view.markers = view.markers || [];
    view.labels = view.labels || [];
    view.strokes = view.strokes || [];
    view.mode = view.mode === "night" ? "night" : "day";
    view.day = view.day || "";
    view.night = view.night || "";
    view.name = view.name || "Вид";
    return view;
  }

  function ensure(campaign) {
    let page = campaign.pages.find(function (item) { return item.kind === "map"; });
    if (!page) {
      page = { id: crypto.randomUUID(), name: "Карта", kind: "map", views: [], activeViewId: "" };
      campaign.pages.push(page);
    }
    page.views = (page.views || []).map(normalize);
    if (!page.views.length) {
      const view = blankView(crypto.randomUUID());
      page.views.push(view);
      page.activeViewId = view.id;
    }
    if (!page.views.some(function (item) { return item.id === page.activeViewId; })) {
      page.activeViewId = page.views[0].id;
    }
    return page;
  }

  function strokeSvg(stroke) {
    const pts = stroke.points || [];
    if (pts.length < 2) return "";
    const width = Math.min(40, Math.max(1, Number(stroke.width) || 3));
    const common = ' fill="none" stroke="' + esc(stroke.color || "#e6c36a") + '" stroke-width="' + width + '" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"';
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (stroke.tool === "line") {
      return '<line x1="' + (a.x * 100) + '" y1="' + (a.y * 100) + '" x2="' + (b.x * 100) + '" y2="' + (b.y * 100) + '"' + common + "/>";
    }
    if (stroke.tool === "rect") {
      const x = Math.min(a.x, b.x) * 100;
      const y = Math.min(a.y, b.y) * 100;
      return '<rect x="' + x + '" y="' + y + '" width="' + (Math.abs(b.x - a.x) * 100) + '" height="' + (Math.abs(b.y - a.y) * 100) + '"' + common + "/>";
    }
    if (stroke.tool === "ellipse") {
      return '<ellipse cx="' + ((a.x + b.x) / 2 * 100) + '" cy="' + ((a.y + b.y) / 2 * 100) + '" rx="' + (Math.abs(b.x - a.x) / 2 * 100) + '" ry="' + (Math.abs(b.y - a.y) / 2 * 100) + '"' + common + "/>";
    }
    return '<polyline points="' + pts.map(function (point) {
      return (point.x * 100).toFixed(2) + "," + (point.y * 100).toFixed(2);
    }).join(" ") + '"' + common + "/>";
  }

  function faces(labels) {
    const seen = {};
    return (labels || []).map(function (item) {
      if (!item.fontUrl || seen[item.fontUrl]) return "";
      seen[item.fontUrl] = true;
      const name = String(item.font || "").split(",")[0].replace(/['"]/g, "").trim().replace(/'/g, "");
      return "@font-face{font-family:'" + name + "';src:url('" + item.fontUrl + "');}";
    }).join("");
  }

  function pinHtml(item, kind, master) {
    if (!master && item.hidden) return "";
    const tip = item.tip ? '<span class="tip">' + esc(item.tip) + "</span>" : "";
    return '<button type="button" class="map-pin ' + kind + (item.hidden ? " is-hidden" : "") + '" data-pin="' + esc(item.id) + '" data-kind="' + kind + '" style="left:' + (item.x * 100) + "%;top:" + (item.y * 100) + '%"><i></i><b>' + esc(item.name || "Без имени") + "</b>" + tip + "</button>";
  }

  function labelHtml(item) {
    const style = "left:" + (item.x * 100) + "%;top:" + (item.y * 100) + "%;color:" + esc(item.ink || "#f3ead8") + ";font-family:" + esc(item.font || "Georgia, serif") + ";font-size:" + (Number(item.size) || 28) + "px;font-weight:" + (item.bold ? "700" : "500") + ";font-style:" + (item.italic ? "italic" : "normal") + ";text-decoration:" + (item.underline ? "underline" : "none");
    return '<button type="button" class="map-label" data-pin="' + esc(item.id) + '" data-kind="label" style="' + style + '">' + esc(item.text || "") + "</button>";
  }

  function html(view, master) {
    const source = view || {};
    const image = (source.mode === "night" && source.night) ? source.night : (source.day || "");
    const dim = source.mode === "night" && !source.night;
    const strokes = (source.strokes || []).map(strokeSvg).join("");
    const locations = (source.locations || []).map(function (item) { return pinHtml(item, "loc", master); }).join("");
    const markers = (source.markers || []).map(function (item) { return pinHtml(item, item.kind === "npc" ? "npc" : "mark", master); }).join("");
    const labels = (source.labels || []).map(labelHtml).join("");
    const face = faces(source.labels);
    return (face ? "<style>" + face + "</style>" : "") +
      '<div class="stage map-stage">' +
      '<div class="map-photo' + (dim ? " is-night" : "") + '" style="background-image:' + (image ? "url('" + esc(image) + "')" : "none") + '"></div>' +
      '<svg class="map-ink" viewBox="0 0 100 100" preserveAspectRatio="none">' + strokes + "</svg>" +
      locations + markers + labels + "</div>";
  }

  function ping(stage, x, y, look) {
    if (!stage) return;
    const node = document.createElement("div");
    const kind = look === "flash" || look === "lights" ? look : "rings";
    node.className = "ping ping-" + kind;
    node.style.left = (Number(x) * 100) + "%";
    node.style.top = (Number(y) * 100) + "%";
    if (kind === "lights") node.innerHTML = "<i></i><i></i><i></i>";
    stage.appendChild(node);
    setTimeout(function () { node.remove(); }, 1800);
  }

  function icon(body) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + body + "</svg>";
  }

  const TOOLS = [
    ["choose", "Выбор", icon('<path d="M5 3l6 16 2-6 6-2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>')],
    ["loc", "Локация", icon('<path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="11" r="1.6" fill="currentColor"/>')],
    ["mark", "Метка", icon('<path d="M12 3l7 9-7 9-7-9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>')],
    ["npc", "НПС", icon('<circle cx="12" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 19c1.2-3 3.2-4.5 6-4.5S16.8 16 18 19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>')],
    ["label", "Надпись", icon('<path d="M7 18h10M9 16l3-10 3 10M10 13h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>')],
    ["brush", "Кисть", icon('<path d="M14 4l6 6-8 8H6v-6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>')],
    ["erase", "Ластик", icon('<path d="M4 14l7-7 7 7-4 4H8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>')],
    ["line", "Линия", icon('<path d="M5 19L19 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>')],
    ["rect", "Рамка", icon('<rect x="5" y="6" width="14" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/>')],
    ["ellipse", "Овал", icon('<ellipse cx="12" cy="12" rx="7" ry="5" fill="none" stroke="currentColor" stroke-width="1.6"/>')],
    ["ping", "Пинг", icon('<circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/>')]
  ];

  function mount(host, ctx) {
    if (host._mapOff) host._mapOff();
    const page = ctx.page;
    let tool = "choose";
    let selected = null;
    let shownForm = "";
    let pendingParent = "";
    let drag = null;
    let press = null;
    let armedMove = false;
    let reopen = false;
    let draw = null;
    let erasing = false;
    let past = [];
    let future = [];
    let timer = 0;

    host.innerHTML = '<aside class="side">' +
      '<label>Вид<select id="map-view"></select></label>' +
      '<label>Название вида<input id="map-view-name" type="text"></label>' +
      '<div class="row"><button type="button" id="map-view-add">Новый вид</button><button type="button" id="map-view-del">Удалить вид</button></div>' +
      '<div class="row"><button type="button" id="map-day">День</button><button type="button" id="map-night">Ночь</button></div>' +
      '<label>Карта дня<select id="map-day-img"></select></label>' +
      '<label>Карта ночи<select id="map-night-img"></select></label>' +
      '<div class="map-tools" id="map-tools"></div>' +
      '<div class="row"><button type="button" id="map-undo">Отмена</button><button type="button" id="map-redo">Повтор</button></div>' +
      '<label>Цвет линии<input id="map-ink" type="color" value="#e6c36a"></label>' +
      '<label>Толщина<input id="map-width" type="range" min="1" max="16" value="3"></label>' +
      '<label>Пинг<select id="map-ping"><option value="rings">Круги</option><option value="flash">Вспышка</option><option value="lights">Огоньки</option></select></label>' +
      '<label>Текст надписи<input id="map-label" type="text" placeholder="Надпись"></label>' +
      '<label>Шрифт<select id="map-font"></select></label>' +
      '<div class="row"><button type="button" id="map-bold">Ж</button><button type="button" id="map-italic">К</button><button type="button" id="map-under">Ч</button></div>' +
      '<label>Размер надписи<input id="map-label-size" type="range" min="14" max="96" value="28"></label>' +
      '<p class="note" id="map-hint">Скрытые точки видите только вы.</p>' +
      '<div id="map-tree"></div>' +
      '<div id="map-selected"></div>' +
      '<p class="error" id="map-err"></p></aside>' +
      '<div class="stage-wrap" id="map-board"></div>';

    const board = host.querySelector("#map-board");
    let styleBold = false;
    let styleItalic = false;
    let styleUnderline = false;

    function view() {
      return page.views.find(function (item) { return item.id === page.activeViewId; }) || page.views[0];
    }
    function dirty() {
      clearTimeout(timer);
      timer = setTimeout(function () { ctx.save(); }, 200);
    }
    function rel(event) {
      const stage = board.querySelector(".stage");
      const rect = stage.getBoundingClientRect();
      const x = rect.width ? (event.clientX - rect.left) / rect.width : 0;
      const y = rect.height ? (event.clientY - rect.top) / rect.height : 0;
      return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
    }
    function findItem() {
      if (!selected) return null;
      const current = view();
      const list = selected.kind === "label" ? current.labels : (selected.kind === "loc" ? current.locations : current.markers);
      return list.find(function (item) { return item.id === selected.id; }) || null;
    }
    function paintBoard() {
      const current = view();
      const draft = draw ? [draw] : [];
      board.innerHTML = html({
        day: current.day,
        night: current.night,
        mode: current.mode,
        locations: current.locations,
        markers: current.markers,
        labels: current.labels,
        strokes: current.strokes.concat(draft)
      }, true);
      if (window.ShirmoFit) window.ShirmoFit(board);
      const stage = board.querySelector(".stage");
      if (stage) stage.classList.toggle("is-erase", tool === "erase");
    }
    function paintTools() {
      host.querySelector("#map-tools").innerHTML = TOOLS.map(function (item) {
        return '<button type="button" data-tool="' + item[0] + '" class="' + (tool === item[0] ? "is-on" : "") + '" title="' + esc(item[1]) + '" aria-label="' + esc(item[1]) + '">' + item[2] + "</button>";
      }).join("");
      const stage = board.querySelector(".stage");
      if (stage) stage.classList.toggle("is-erase", tool === "erase");
      host.querySelector("#map-day").classList.toggle("is-on", view().mode !== "night");
      host.querySelector("#map-night").classList.toggle("is-on", view().mode === "night");
      host.querySelector("#map-bold").classList.toggle("is-on", styleBold);
      host.querySelector("#map-italic").classList.toggle("is-on", styleItalic);
      host.querySelector("#map-under").classList.toggle("is-on", styleUnderline);
    }
    function treeHtml(parentId, depth) {
      return view().locations.filter(function (item) { return (item.parentId || "") === parentId; }).map(function (item) {
        const on = selected && selected.kind === "loc" && selected.id === item.id ? " is-on" : "";
        return '<div class="map-node" style="margin-left:' + (depth * 12) + 'px"><button type="button" data-loc="' + esc(item.id) + '" class="' + on + '">' + esc(item.name || "Локация") + (item.hidden ? " · скрыта" : "") + "</button></div>" + treeHtml(item.id, depth + 1);
      }).join("");
    }
    function paintTree() {
      const htmlTree = treeHtml("", 0);
      host.querySelector("#map-tree").innerHTML = htmlTree || '<p class="roll-empty">Локаций нет</p>';
    }
    function paintLists() {
      const current = view();
      const images = ctx.library().images || [];
      function options(selectedUrl) {
        return '<option value="">Нет</option>' + images.map(function (item) {
          return '<option value="' + esc(item.url) + '"' + (item.url === selectedUrl ? " selected" : "") + ">" + esc(item.name) + "</option>";
        }).join("");
      }
      const views = host.querySelector("#map-view");
      views.innerHTML = page.views.map(function (item) {
        return '<option value="' + esc(item.id) + '">' + esc(item.name || "Вид") + "</option>";
      }).join("");
      views.value = current.id;
      host.querySelector("#map-view-name").value = current.name || "";
      host.querySelector("#map-day-img").innerHTML = options(current.day);
      host.querySelector("#map-night-img").innerHTML = options(current.night);
      const fonts = ctx.fonts();
      host.querySelector("#map-font").innerHTML = fonts.map(function (item) {
        return '<option value="' + esc(item.font) + '">' + esc(item.name) + "</option>";
      }).join("");
      paintTools();
      paintTree();
    }
    function paintSelected() {
      const key = selected ? selected.kind + ":" + selected.id : "";
      if (key === shownForm) return;
      shownForm = key;
      const box = host.querySelector("#map-selected");
      const item = findItem();
      if (!item) {
        box.innerHTML = "";
        return;
      }
      const child = selected.kind === "loc" ? '<button type="button" id="sel-child">Подлокация</button>' : "";
      box.innerHTML = (selected.kind === "label" ? "" : '<label>Подсказка<textarea id="sel-tip">' + esc(item.tip || "") + "</textarea></label>" +
        '<label class="check"><input id="sel-hide" type="checkbox"' + (item.hidden ? " checked" : "") + "> Скрыть от игроков</label>") +
        '<div class="row">' + child + '<button type="button" id="sel-del">Удалить</button></div>';
      const tip = box.querySelector("#sel-tip");
      if (tip) tip.addEventListener("input", function (event) {
        item.tip = event.target.value;
        paintBoard();
        dirty();
      });
      const hide = box.querySelector("#sel-hide");
      if (hide) hide.addEventListener("change", function () {
        item.hidden = hide.checked;
        paintBoard();
        paintTree();
        dirty();
      });
      const childBtn = box.querySelector("#sel-child");
      if (childBtn) childBtn.addEventListener("click", function () {
        pendingParent = item.id;
        tool = "loc";
        host.querySelector("#map-hint").textContent = "Следующий клик поставит подлокацию.";
        paintTools();
      });
      box.querySelector("#sel-del").addEventListener("click", function () { removeItem(); });
    }
    function removeItem() {
      const item = findItem();
      if (!item) return;
      const current = view();
      if (selected.kind === "loc") {
        const drop = {};
        function mark(id) {
          drop[id] = true;
          current.locations.forEach(function (loc) { if (loc.parentId === id) mark(loc.id); });
        }
        mark(item.id);
        current.locations = current.locations.filter(function (loc) { return !drop[loc.id]; });
      } else if (selected.kind === "label") {
        current.labels = current.labels.filter(function (label) { return label.id !== item.id; });
      } else {
        current.markers = current.markers.filter(function (marker) { return marker.id !== item.id; });
      }
      selected = null;
      shownForm = "";
      armedMove = false;
      closeMenu();
      paintBoard();
      paintTree();
      paintSelected();
      ctx.save();
    }
    function copyItem() {
      const item = findItem();
      if (!item) return;
      const copy = JSON.parse(JSON.stringify(item));
      copy.id = crypto.randomUUID();
      copy.x = Math.min(1, (Number(item.x) || 0) + 0.03);
      copy.y = Math.min(1, (Number(item.y) || 0) + 0.03);
      const current = view();
      if (selected.kind === "loc") current.locations.push(copy);
      else current.markers.push(copy);
      selected = { kind: selected.kind, id: copy.id };
      shownForm = "";
      paintBoard();
      paintTree();
      paintSelected();
      ctx.save();
      showMenu();
    }
    function book() {
      const campaign = ctx.campaign;
      if (!campaign.codex) campaign.codex = {};
      campaign.codex.places = campaign.codex.places || [];
      campaign.codex.npcs = campaign.codex.npcs || [];
      return campaign.codex;
    }
    function linkedList() {
      return selected && selected.kind === "npc" ? book().npcs : book().places;
    }
    function renameLinked(name) {
      const item = findItem();
      if (!item) return;
      const ref = selected.kind === "loc" ? item.placeId : (selected.kind === "npc" ? item.npcId : "");
      if (!ref) return;
      const list = selected.kind === "loc" ? book().places : book().npcs;
      const entry = list.find(function (row) { return row.id === ref; });
      if (entry) entry.name = name;
      page.views.forEach(function (one) {
        const rows = selected.kind === "loc" ? one.locations : one.markers;
        (rows || []).forEach(function (row) {
          const id = selected.kind === "loc" ? row.placeId : row.npcId;
          if (id === ref) row.name = name;
        });
      });
    }
    function closeMenu() {
      const menu = document.getElementById("pin-menu");
      if (menu) menu.remove();
    }
    function beginRename() {
      const item = findItem();
      if (!item || !selected) return;
      closeMenu();
      const pin = board.querySelector('[data-pin="' + selected.id + '"]');
      if (!pin) return;
      const label = pin.querySelector("b") || pin;
      const rect = label.getBoundingClientRect();
      const look = getComputedStyle(label);
      const input = document.createElement("input");
      input.id = "pin-rename";
      input.className = "pin-rename";
      input.value = item.name || item.text || "";
      input.style.left = rect.left + "px";
      input.style.top = rect.top + "px";
      input.style.width = Math.max(rect.width + 24, 96) + "px";
      input.style.fontSize = look.fontSize;
      input.style.fontFamily = look.fontFamily;
      document.body.appendChild(input);
      input.focus();
      input.select();
      let done = false;
      function finish(save) {
        if (done) return;
        done = true;
        const value = input.value.trim();
        input.remove();
        if (save && value) {
          if (selected.kind === "label") item.text = value;
          else item.name = value;
          renameLinked(value);
          paintBoard();
          paintTree();
          ctx.save();
        }
      }
      input.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") { event.preventDefault(); finish(true); }
        if (event.key === "Escape") { event.preventDefault(); finish(false); }
      });
      input.addEventListener("blur", function () { finish(true); });
    }
    function assignCodex() {
      const item = findItem();
      if (!item || !selected || (selected.kind !== "loc" && selected.kind !== "npc")) return;
      const list = linkedList();
      closeMenu();
      const pin = board.querySelector('[data-pin="' + selected.id + '"]');
      if (!pin) return;
      const rect = pin.getBoundingClientRect();
      const menu = document.createElement("div");
      menu.id = "pin-menu";
      menu.className = "pin-menu pin-codex";
      menu.innerHTML = '<p class="note">' + (selected.kind === "loc" ? "Локации" : "НПС") + "</p>" +
        (list.map(function (row) {
          return '<button type="button" data-id="' + esc(row.id) + '">' + esc(row.name || "Без имени") + "</button>";
        }).join("") || '<p class="roll-empty">В справочнике пусто</p>') +
        '<input id="codex-new" type="text" placeholder="Новая запись">' +
        '<button type="button" data-act="add">Добавить и назначить</button>';
      menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 240)) + "px";
      menu.style.top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 280)) + "px";
      document.body.appendChild(menu);
      menu.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
      function take(entry) {
        item.name = entry.name || item.name;
        if (selected.kind === "loc") item.placeId = entry.id;
        else item.npcId = entry.id;
        closeMenu();
        paintBoard();
        paintTree();
        ctx.save();
      }
      menu.addEventListener("click", function (event) {
        const id = event.target.getAttribute("data-id");
        if (id) {
          const entry = list.find(function (row) { return row.id === id; });
          if (entry) take(entry);
          return;
        }
        if (event.target.getAttribute("data-act") !== "add") return;
        const name = menu.querySelector("#codex-new").value.trim();
        if (!name) return;
        const entry = { id: crypto.randomUUID(), name: name };
        list.push(entry);
        take(entry);
      });
      menu.querySelector("#codex-new").addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        menu.querySelector("[data-act=add]").click();
      });
    }
    function showMenu() {
      closeMenu();
      const item = findItem();
      if (!item || !selected || selected.kind === "label") return;
      const pin = board.querySelector('[data-pin="' + selected.id + '"]');
      if (!pin) return;
      const rect = pin.getBoundingClientRect();
      const menu = document.createElement("div");
      menu.id = "pin-menu";
      menu.className = "pin-menu";
      const fromBook = selected.kind === "loc" || selected.kind === "npc"
        ? '<button type="button" data-act="book">Из справочника</button>' : "";
      menu.innerHTML = '<button type="button" data-act="del">Удалить</button>' +
        '<button type="button" data-act="copy">Копировать</button>' +
        '<button type="button" data-act="move">Переместить</button>' +
        '<button type="button" data-act="rename">Переименовать</button>' + fromBook;
      menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 168)) + "px";
      menu.style.top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 132)) + "px";
      document.body.appendChild(menu);
      menu.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
      menu.addEventListener("click", function (event) {
        const act = event.target.getAttribute("data-act");
        if (!act) return;
        if (act === "del") removeItem();
        if (act === "copy") copyItem();
        if (act === "rename") beginRename();
        if (act === "book") assignCodex();
        if (act === "move") {
          closeMenu();
          armedMove = true;
          host.querySelector("#map-hint").textContent = "Кликните новое место или перетащите точку.";
        }
      });
    }
    function hintBack() {
      armedMove = false;
      const hint = host.querySelector("#map-hint");
      if (hint) hint.textContent = "Скрытые точки видите только вы.";
    }
    function chooseFont() {
      const value = host.querySelector("#map-font").value;
      const found = ctx.fonts().find(function (item) { return item.font === value; });
      return found || { font: "Georgia, serif", url: "" };
    }
    function addPoint(kind, at) {
      const current = view();
      const id = crypto.randomUUID();
      if (kind === "loc") {
        current.locations.push({
          id: id,
          parentId: pendingParent,
          name: "Локация",
          x: at.x,
          y: at.y,
          tip: "",
          hidden: false
        });
        pendingParent = "";
        host.querySelector("#map-hint").textContent = "Скрытые точки видите только вы.";
        selected = { kind: "loc", id: id };
      } else if (kind === "label") {
        const text = host.querySelector("#map-label").value.trim();
        if (!text) return;
        const font = chooseFont();
        current.labels.push({
          id: id,
          text: text,
          x: at.x,
          y: at.y,
          font: font.font,
          fontUrl: font.url,
          size: Number(host.querySelector("#map-label-size").value) || 28,
          ink: "#f3ead8",
          bold: styleBold,
          italic: styleItalic,
          underline: styleUnderline
        });
        selected = { kind: "label", id: id };
      } else {
        current.markers.push({
          id: id,
          name: kind === "npc" ? "НПС" : "Метка",
          x: at.x,
          y: at.y,
          kind: kind === "npc" ? "npc" : "mark",
          tip: "",
          hidden: false
        });
        selected = { kind: kind === "npc" ? "npc" : "mark", id: id };
      }
      shownForm = "";
      paintBoard();
      paintTree();
      paintSelected();
      ctx.save();
    }

    host._refresh = paintLists;
    paintLists();
    paintBoard();
    paintSelected();

    host.querySelector("#map-tools").addEventListener("click", function (event) {
      const button = event.target.closest("[data-tool]");
      if (!button) return;
      tool = button.getAttribute("data-tool");
      if (tool !== "loc") pendingParent = "";
      paintTools();
    });
    host.querySelector("#map-view").addEventListener("change", function (event) {
      page.activeViewId = event.target.value;
      selected = null;
      shownForm = "";
      future = [];
      paintLists();
      paintBoard();
      paintSelected();
      ctx.save();
    });
    host.querySelector("#map-view-name").addEventListener("input", function (event) {
      view().name = event.target.value;
      dirty();
    });
    host.querySelector("#map-view-add").addEventListener("click", function () {
      const next = blankView(crypto.randomUUID());
      next.name = "Вид " + (page.views.length + 1);
      page.views.push(next);
      page.activeViewId = next.id;
      selected = null;
      shownForm = "";
      paintLists();
      paintBoard();
      paintSelected();
      ctx.save();
    });
    host.querySelector("#map-view-del").addEventListener("click", function () {
      if (page.views.length < 2) return;
      page.views = page.views.filter(function (item) { return item.id !== view().id; });
      page.activeViewId = page.views[0].id;
      selected = null;
      shownForm = "";
      paintLists();
      paintBoard();
      paintSelected();
      ctx.save();
    });
    host.querySelector("#map-day").addEventListener("click", function () {
      view().mode = "day";
      paintTools();
      paintBoard();
      ctx.save();
    });
    host.querySelector("#map-night").addEventListener("click", function () {
      view().mode = "night";
      paintTools();
      paintBoard();
      ctx.save();
    });
    host.querySelector("#map-day-img").addEventListener("change", function (event) {
      view().day = event.target.value;
      paintBoard();
      ctx.save();
    });
    host.querySelector("#map-night-img").addEventListener("change", function (event) {
      view().night = event.target.value;
      paintBoard();
      ctx.save();
    });
    host.querySelector("#map-bold").addEventListener("click", function () { styleBold = !styleBold; paintTools(); });
    host.querySelector("#map-italic").addEventListener("click", function () { styleItalic = !styleItalic; paintTools(); });
    host.querySelector("#map-under").addEventListener("click", function () { styleUnderline = !styleUnderline; paintTools(); });
    function restoreStrokes(raw) {
      view().strokes = JSON.parse(raw);
      paintBoard();
      ctx.save();
    }
    host.querySelector("#map-undo").addEventListener("click", function () {
      if (!past.length) return;
      future.push(JSON.stringify(view().strokes || []));
      restoreStrokes(past.pop());
    });
    host.querySelector("#map-redo").addEventListener("click", function () {
      if (!future.length) return;
      past.push(JSON.stringify(view().strokes || []));
      restoreStrokes(future.pop());
    });
    host.querySelector("#map-tree").addEventListener("click", function (event) {
      const button = event.target.closest("[data-loc]");
      if (!button) return;
      closeMenu();
      selected = { kind: "loc", id: button.getAttribute("data-loc") };
      shownForm = "";
      tool = "choose";
      paintTools();
      paintTree();
      paintSelected();
    });

    let wheel = null;
    function closeWheel() {
      if (wheel && wheel.el) wheel.el.remove();
      wheel = null;
    }
    function wheelIndex(x, y) {
      const dx = x - wheel.x;
      const dy = y - wheel.y;
      if (Math.hypot(dx, dy) < 46) return -1;
      const step = (Math.PI * 2) / TOOLS.length;
      const rel = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
      return Math.round(rel / step) % TOOLS.length;
    }
    function paintWheel() {
      const name = wheel.el.querySelector(".wheel-name");
      wheel.el.querySelectorAll("button").forEach(function (button, index) {
        button.classList.toggle("is-hot", index === wheel.index);
      });
      name.textContent = wheel.index >= 0 ? TOOLS[wheel.index][1] : "";
    }
    function openWheel(x, y) {
      closeWheel();
      closeMenu();
      const el = document.createElement("div");
      el.id = "tool-wheel";
      el.className = "tool-wheel";
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.innerHTML = '<span class="wheel-name"></span>' + TOOLS.map(function (item, index) {
        const deg = index * (360 / TOOLS.length);
        return '<button type="button" style="--a:' + deg + 'deg" class="' + (tool === item[0] ? "is-on" : "") + '">' + item[1] + "</button>";
      }).join("");
      document.body.appendChild(el);
      wheel = { x: x, y: y, el: el, index: -1 };
    }
    function pickWheel(x, y) {
      if (!wheel) return;
      const index = wheelIndex(x, y);
      if (index >= 0) {
        tool = TOOLS[index][0];
        if (tool !== "loc") pendingParent = "";
        paintTools();
      }
      closeWheel();
    }
    function pinKind(hit) {
      const kind = hit.getAttribute("data-kind");
      return kind === "loc" || kind === "mark" || kind === "npc";
    }
    function onDown(event) {
      if (event.button === 1) {
        event.preventDefault();
        openWheel(event.clientX, event.clientY);
        return;
      }
      if (wheel) closeWheel();
      if (event.button !== 0) return;
      const stage = board.querySelector(".stage");
      if (!stage || !board.contains(event.target)) return;
      const at = rel(event);
      const hit = event.target.closest("[data-pin]");
      if (armedMove && selected && selected.kind !== "label") {
        const item = findItem();
        if (item) {
          item.x = at.x;
          item.y = at.y;
          hintBack();
          paintBoard();
          ctx.save();
          reopen = true;
        }
        return;
      }
      if (tool === "erase") {
        event.preventDefault();
        past.push(JSON.stringify(view().strokes || []));
        future = [];
        erasing = true;
        rub(at);
        return;
      }
      if (hit && board.contains(hit) && pinKind(hit)) {
        event.preventDefault();
        closeMenu();
        selected = { kind: hit.getAttribute("data-kind"), id: hit.getAttribute("data-pin") };
        press = { sx: event.clientX, sy: event.clientY, moved: false };
        shownForm = "";
        paintSelected();
        paintTree();
        return;
      }
      if (tool === "choose") {
        closeMenu();
        if (!hit || !board.contains(hit)) {
          selected = null;
          shownForm = "";
          paintSelected();
          paintTree();
          return;
        }
        selected = { kind: hit.getAttribute("data-kind"), id: hit.getAttribute("data-pin") };
        drag = true;
        shownForm = "";
        paintSelected();
        paintTree();
        return;
      }
      event.preventDefault();
      if (tool === "loc" || tool === "mark" || tool === "npc" || tool === "label") {
        addPoint(tool, at);
        return;
      }
      if (tool === "ping") {
        const look = host.querySelector("#map-ping").value;
        ping(stage, at.x, at.y, look);
        ctx.ping({ x: at.x, y: at.y }, look).catch(function (error) {
          const slot = host.querySelector("#map-err");
          if (slot) slot.textContent = error.message;
        });
        return;
      }
      draw = {
        tool: tool,
        color: host.querySelector("#map-ink").value,
        width: Number(host.querySelector("#map-width").value) || 3,
        points: [at, at]
      };
    }
    function onMove(event) {
      if (wheel) {
        const next = wheelIndex(event.clientX, event.clientY);
        if (next !== wheel.index) {
          wheel.index = next;
          paintWheel();
        }
        return;
      }
      if (press && !press.moved) {
        const dx = event.clientX - press.sx;
        const dy = event.clientY - press.sy;
        if (dx * dx + dy * dy > 25) {
          press.moved = true;
          drag = true;
          closeMenu();
          hintBack();
        }
      }
      if (!drag && !draw && !erasing) return;
      if (!board.querySelector(".stage")) return;
      const at = rel(event);
      if (erasing) {
        rub(at);
        return;
      }
      if (drag) {
        const item = findItem();
        if (!item) return;
        item.x = at.x;
        item.y = at.y;
        paintBoard();
        return;
      }
      if (!draw) return;
      if (draw.tool === "brush") draw.points.push(at);
      else draw.points[1] = at;
      paintBoard();
    }
    function distToSeg(p, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = dx * dx + dy * dy;
      const t = len > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
      return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
    }
    function strokeHits(stroke, at, radius) {
      const pts = (stroke.points || []).map(function (point) {
        return { x: point.x * 1368, y: point.y * 786 };
      });
      if (pts.length < 2) return false;
      const p = { x: at.x * 1368, y: at.y * 786 };
      const tol = radius + (Number(stroke.width) || 3) / 2;
      const a = pts[0];
      const b = pts[pts.length - 1];
      if (stroke.tool === "rect") {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        const edges = [[{ x: x, y: y }, { x: x + w, y: y }], [{ x: x + w, y: y }, { x: x + w, y: y + h }], [{ x: x + w, y: y + h }, { x: x, y: y + h }], [{ x: x, y: y + h }, { x: x, y: y }]];
        return edges.some(function (edge) { return distToSeg(p, edge[0], edge[1]) <= tol; });
      }
      if (stroke.tool === "ellipse") {
        const rx = Math.max(1, Math.abs(b.x - a.x) / 2);
        const ry = Math.max(1, Math.abs(b.y - a.y) / 2);
        const nx = (p.x - (a.x + b.x) / 2) / rx;
        const ny = (p.y - (a.y + b.y) / 2) / ry;
        return Math.abs(Math.hypot(nx, ny) - 1) * Math.min(rx, ry) <= tol;
      }
      const list = stroke.tool === "line" ? [a, b] : pts;
      for (let i = 1; i < list.length; i++) {
        if (distToSeg(p, list[i - 1], list[i]) <= tol) return true;
      }
      return false;
    }
    function rub(at) {
      const radius = Math.max(8, Number(host.querySelector("#map-width").value) || 8);
      const left = (view().strokes || []).filter(function (stroke) { return !strokeHits(stroke, at, radius); });
      if (left.length === view().strokes.length) return;
      view().strokes = left;
      paintBoard();
    }
    function finishErase() {
      if (!erasing) return;
      erasing = false;
      const now = JSON.stringify(view().strokes || []);
      if (past.length && past[past.length - 1] === now) past.pop();
      else ctx.save();
    }
    function onUp(event) {
      if (event && event.button === 1) {
        finishErase();
        if (wheel) pickWheel(event.clientX, event.clientY);
        return;
      }
      finishErase();
      if (press) {
        const open = !press.moved;
        press = null;
        if (open) showMenu();
      } else if (reopen) {
        reopen = false;
        showMenu();
      }
      if (drag) {
        drag = null;
        ctx.save();
      }
      if (!draw) return;
      const stroke = draw;
      draw = null;
      if (stroke.points.length >= 2) {
        past.push(JSON.stringify(view().strokes || []));
        future = [];
        view().strokes.push(stroke);
        ctx.save();
      }
      paintBoard();
    }
    function onDocDown(event) {
      const menu = document.getElementById("pin-menu");
      if (!menu || menu.contains(event.target)) return;
      if (event.target.closest && event.target.closest("[data-pin]")) return;
      closeMenu();
    }
    board.addEventListener("dblclick", function (event) {
      const hit = event.target.closest("[data-pin]");
      if (!hit || !board.contains(hit)) return;
      event.preventDefault();
      selected = { kind: hit.getAttribute("data-kind"), id: hit.getAttribute("data-pin") };
      shownForm = "";
      beginRename();
    });
    board.addEventListener("mousedown", function (event) {
      if (event.button === 1) event.preventDefault();
    });
    board.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerdown", onDocDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    host._mapOff = function () {
      window.removeEventListener("pointerdown", onDocDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      closeMenu();
      closeWheel();
      const rename = document.getElementById("pin-rename");
      if (rename) rename.remove();
      clearTimeout(timer);
    };
  }

  window.ShirmoMap = { ensure: ensure, mount: mount, html: html, ping: ping };
})();
