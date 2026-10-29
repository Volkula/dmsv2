(function () {
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const COIN_SEED = [
    { name: "Медная", code: "мм", copper: 1 },
    { name: "Серебряная", code: "см", copper: 10 },
    { name: "Электрумовая", code: "эм", copper: 50 },
    { name: "Золотая", code: "зм", copper: 100 },
    { name: "Платиновая", code: "пм", copper: 1000 }
  ];

  function coinList(campaign) {
    const book = campaign && campaign.codex;
    return book && Array.isArray(book.coins) ? book.coins : [];
  }

  function partsOf(item, coins) {
    if (item && item.coin) return { amount: item.price == null || item.price === "" ? "" : item.price, coin: item.coin };
    const text = String(item && item.price || "").trim();
    const match = text.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
    if (!match) return { amount: "", coin: "" };
    const code = match[2].trim().toLowerCase();
    const found = code ? coins.find(function (coin) {
      return String(coin.code || "").trim().toLowerCase() === code || String(coin.name || "").trim().toLowerCase() === code;
    }) : null;
    return { amount: match[1].replace(",", "."), coin: found ? found.id : "" };
  }

  window.ShirmoCoins = {
    list: coinList,
    ensure: function (campaign) {
      const book = campaign && campaign.codex;
      if (!book) return [];
      if (!Array.isArray(book.coins)) {
        book.coins = COIN_SEED.map(function (coin) {
          return { id: crypto.randomUUID(), name: coin.name, code: coin.code, copper: coin.copper };
        });
      }
      return book.coins;
    },
    text: function (item, campaign) {
      if (!item) return "";
      if (item.coin) {
        const coin = coinList(campaign).find(function (row) { return row.id === item.coin; });
        const code = coin ? (coin.code || coin.name || "") : "";
        const amount = item.price == null || item.price === "" ? "" : String(item.price);
        return [amount, code].filter(Boolean).join(" ");
      }
      return item.price || "";
    },
    equation: function (campaign) {
      const list = coinList(campaign).filter(function (coin) { return Number(coin.copper) > 0; })
        .slice().sort(function (a, b) { return Number(b.copper) - Number(a.copper); });
      if (list.length < 2) return "Добавьте вторую монету, чтобы увидеть отношение.";
      const top = Number(list[0].copper);
      return list.map(function (coin) {
        const ratio = top / Number(coin.copper);
        const text = Math.abs(ratio - Math.round(ratio)) < 0.001 ? String(Math.round(ratio)) : String(Math.round(ratio * 100) / 100);
        return text + " " + (coin.code || coin.name || "монета");
      }).join(" = ");
    },
    adopt: function (item, text, campaign) {
      const part = partsOf({ price: text }, coinList(campaign));
      if (part.amount === "" && text) {
        item.price = text;
        item.coin = "";
        return;
      }
      item.price = part.amount;
      item.coin = part.coin;
    },
    fields: function (item, campaign, amountAttr, coinAttr) {
      const coins = this.ensure(campaign);
      const part = partsOf(item, coins);
      const options = '<option value="">—</option>' + coins.map(function (coin) {
        const label = coin.code ? coin.code + " · " + (coin.name || "") : (coin.name || "Монета");
        return '<option value="' + esc(coin.id) + '"' + (coin.id === part.coin ? " selected" : "") + ">" + esc(label) + "</option>";
      }).join("");
      const amount = part.amount === "" || part.amount == null ? "" : esc(String(part.amount));
      return '<input class="num" type="number" min="0" step="1" ' + amountAttr + ' value="' + amount + '" placeholder="0" title="Стоимость числом" aria-label="Стоимость">' +
        '<select class="price-coin" ' + coinAttr + ' title="Валюта из списка" aria-label="Валюта">' + options + "</select>";
    },
    take: function (item, input) {
      const row = input && input.closest(".ware-row, .ware-item, .shop-item");
      if (!row) return;
      const num = row.querySelector('input[type="number"][data-good="price"], input[type="number"][data-ware="price"], input[type="number"][data-own-field="price"], input[type="number"][data-shop="price"]');
      const coin = row.querySelector('select[data-good="coin"], select[data-ware="coin"], select[data-own-field="coin"], select[data-shop="coin"]');
      if (num) item.price = num.value === "" ? "" : String(Math.max(0, Math.round(Number(num.value) || 0)));
      if (coin) item.coin = coin.value;
    }
  };

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
      strokes: [],
      focusId: ""
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
    view.focusId = view.focusId || "";
    view.locations.forEach(function (loc) {
      loc.day = loc.day || "";
      loc.night = loc.night || "";
      loc.mode = loc.mode === "night" ? "night" : "day";
      loc.trashed = !!loc.trashed;
    });
    function buried(id) {
      let cursor = id;
      let guard = 0;
      while (cursor && guard < 24) {
        const loc = view.locations.find(function (item) { return item.id === cursor; });
        if (!loc) return true;
        if (loc.trashed) return true;
        cursor = loc.parentId || "";
        guard += 1;
      }
      return false;
    }
    if (!view.focusId || buried(view.focusId)) view.focusId = "";
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

  function hexColor(value, fallback) {
    return /^#[0-9a-fA-F]{6}$/.test(String(value || "")) ? String(value) : fallback;
  }

  function faces(source) {
    const seen = {};
    const items = [].concat(source.labels || [], source.markers || [], source.locations || []);
    return items.map(function (item) {
      if (!item.fontUrl || seen[item.fontUrl]) return "";
      seen[item.fontUrl] = true;
      const name = String(item.font || "").split(",")[0].replace(/['"]/g, "").trim().replace(/'/g, "");
      return "@font-face{font-family:'" + name + "';src:url('" + item.fontUrl + "');}";
    }).join("");
  }

  function oneLine(value) {
    return String(value || "").replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
  }

  function captionCss(item, fallbackSize) {
    const size = Math.min(96, Math.max(10, Number(item.size) || fallbackSize));
    const stroke = Math.min(8, Math.max(0, Number(item.strokeWidth) || 0));
    const parts = [
      "color:" + esc(item.ink || "#f3ead8"),
      "font-family:" + esc(item.font || "Georgia, serif"),
      "font-size:" + size + "px",
      "font-weight:" + (item.bold ? "700" : "500"),
      "font-style:" + (item.italic ? "italic" : "normal"),
      "text-decoration:" + (item.underline ? "underline" : "none")
    ];
    if (stroke > 0) {
      parts.push("-webkit-text-stroke:" + stroke + "px " + esc(item.stroke || "#1a140c"));
      parts.push("paint-order:stroke fill");
      parts.push("text-shadow:none");
    }
    if (item.plate) {
      parts.push("background:" + esc(item.plate));
      parts.push("padding:1px 5px");
      parts.push("border-radius:4px");
      parts.push("text-shadow:none");
    }
    return parts.join(";");
  }

  function focusNums(item) {
    const x = Number(item && item.portraitX);
    const y = Number(item && item.portraitY);
    const zoom = Number(item && item.portraitZoom);
    return {
      x: Number.isFinite(x) ? Math.min(100, Math.max(0, x)) : 50,
      y: Number.isFinite(y) ? Math.min(100, Math.max(0, y)) : 50,
      zoom: Number.isFinite(zoom) ? Math.min(3, Math.max(1, zoom)) : 1
    };
  }

  function faceStyle(item) {
    const face = focusNums(item);
    return "object-position:" + face.x + "% " + face.y + "%;transform:scale(" + face.zoom + ");transform-origin:" + face.x + "% " + face.y + "%";
  }

  function shownMap(item) {
    return !(item && item.hidden);
  }

  function shownScreen(item) {
    if (!item) return true;
    if (item.screen === false) return false;
    if (item.screen === true) return true;
    return !item.hidden;
  }

  function eyeSvg(open) {
    const slash = open ? "" : '<path d="M5 19L19 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/>' + slash + "</svg>";
  }

  function mapSvg(open) {
    const slash = open ? "" : '<path d="M5 19L19 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5l5-2 6 2 5-2v13l-5 2-6-2-5 2v-13z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 4.5v13M15 6.5v13" fill="none" stroke="currentColor" stroke-width="1.6"/>' + slash + "</svg>";
  }

  function flagMark(kind, open) {
    const title = kind === "screen"
      ? (open ? "Показано на экране игроков. Нажмите, чтобы скрыть" : "Скрыто с экрана игроков. Нажмите, чтобы показать")
      : (open ? "Показано на карте. Нажмите, чтобы скрыть" : "Скрыто на карте. Нажмите, чтобы показать");
    const label = kind === "screen"
      ? (open ? "На экране игроков" : "Скрыто с экрана игроков")
      : (open ? "На карте" : "Скрыто на карте");
    const icon = kind === "screen" ? eyeSvg(open) : mapSvg(open);
    return '<span role="button" data-flag="' + kind + '" class="flag' + (open ? "" : " is-off") + '" title="' + esc(title) + '" aria-label="' + esc(label) + '">' + icon + "</span>";
  }

  function lampFlag(item) {
    try {
      if (!item || !window.ShirmoPlugins || !window.ShirmoPlugins.on()) return "";
    } catch (err) { return ""; }
    const color = /^#[0-9a-f]{6}$/i.test(item.lampColor || "") ? item.lampColor : "#16130f";
    const on = item.lamp === true;
    return '<span role="button" data-flag="lamp" data-lamp="' + esc(item.id) + '" class="flag flag-lamp' + (on ? " is-on" : "") + '" style="--swatch:' + esc(color) + ";background-color:" + esc(color) + '" title="' + (on ? "Подсветка этой локации включена" : "Подсветка выключена. Нажмите, чтобы задать цвет") + '" aria-label="Цвет подсветки"></span>';
  }

  function flagBar(flags) {
    if (!flags || !flags.loc) return "";
    const lamp = lampFlag(flags.loc);
    const marks = flags.bare ? "" : flagMark("screen", !!flags.screen) + flagMark("map", !!flags.map);
    if (!marks && !lamp) return "";
    return '<div class="map-flags">' + marks + lamp + "</div>";
  }

  const MARK_GLYPHS = ["⚔", "🛡", "☠", "🔥", "🔑", "💰", "🚪", "⛺", "⭐", "❗", "❓", "🧪", "📜", "💎", "⚓", "🏠", "🌳", "👁", "🐴", "📦", "🚩", "💤"];

  function pinHtml(item, kind, master) {
    if (!master && item.hidden) return "";
    const tip = item.tip ? '<span class="tip">' + esc(item.tip) + "</span>" : "";
    if (kind === "image") {
      const url = item.url || item.icon || "";
      if (!url) return "";
      const size = Math.min(480, Math.max(24, Number(item.pinSize) || 120));
      const marks = master
        ? '<span class="pin-flags">' + flagMark("screen", shownScreen(item)) + flagMark("map", shownMap(item)) + "</span>"
        : "";
      return '<button type="button" class="map-pin image' + (item.hidden ? " is-hidden" : "") + '" data-pin="' + esc(item.id) + '" data-kind="image" aria-label="' + esc(item.name || "Картинка") + '" style="left:' + (item.x * 100) + "%;top:" + (item.y * 100) + "%;--pin:" + size + 'px">' + marks + '<img alt="" src="' + esc(url) + '">' + tip + "</button>";
    }
    const full = item.look === "full";
    const portrait = kind === "npc" || kind === "loc" || kind === "foe" || kind === "hero" ? (item.portrait || "") : "";
    const markIcon = kind === "mark" ? (item.icon || "") : "";
    const markEmoji = kind === "mark" ? (item.emoji || "") : "";
    const saved = Number(item.pinSize) || 0;
    const size = full
      ? Math.min(280, Math.max(72, saved > 64 ? saved : 140))
      : Math.min(160, Math.max(12, saved || (portrait ? 56 : (markIcon || markEmoji ? 36 : 14))));
    const badge = master && item.emoji && kind !== "mark" ? '<em class="pin-emoji">' + esc(item.emoji) + "</em>" : "";
    let dot = "<i></i>";
    if (markIcon) {
      dot = '<i class="mark-icon"><img alt="" src="' + esc(markIcon) + '">' + (markEmoji ? '<em class="pin-emoji">' + esc(markEmoji) + "</em>" : "") + "</i>";
    } else if (markEmoji) {
      dot = '<i class="mark-glyph">' + esc(markEmoji) + "</i>";
    } else if (portrait) {
      const crop = item.look === "full" ? "" : ' style="' + faceStyle(item) + '"';
      dot = '<i><img alt="" src="' + esc(portrait) + '"' + crop + ">" + badge + "</i>";
    }
    const marks = master && (kind === "npc" || kind === "loc" || kind === "foe" || kind === "hero" || kind === "mark")
      ? '<span class="pin-flags">' + flagMark("screen", shownScreen(item)) + flagMark("map", shownMap(item)) + (kind === "loc" ? lampFlag(item) : "") + "</span>"
      : "";
    const hp = master && kind === "foe" && item.hpMax ? '<em class="pin-hp">' + esc(String(item.hp == null ? item.hpMax : item.hp)) + "/" + esc(String(item.hpMax)) + "</em>" : "";
    const vitals = master && kind === "hero" ? heroVitalsHtml(item) : "";
    const showCap = kind !== "npc" || item.showName === true;
    const caption = (showCap ? '<b style="' + captionCss(item, 14) + '">' + esc(item.name || (kind === "loc" ? "Локация" : "Без имени")) + "</b>" : "") + hp;
    const named = kind === "loc" || (kind === "npc" && !showCap)
      ? ' aria-label="' + esc(oneLine(item.name) || (kind === "loc" ? "Локация" : "НПС")) + '"'
      : "";
    const cap = item.capTop ? " cap-top" : "";
    const fight = item.toBattle ? ' data-battle="1" title="Открыть экран боя"' : "";
    const door = item.door && !item.toBattle ? ' title="Переход в уже размещённое место"' : "";
    return '<button type="button" class="map-pin ' + kind + cap + (portrait ? " has-face" : "") + (full ? " is-full" : "") + (item.hidden ? " is-hidden" : "") + '" data-pin="' + esc(item.id) + '" data-kind="' + kind + '"' + named + fight + door + ' style="left:' + (item.x * 100) + "%;top:" + (item.y * 100) + "%;--pin:" + size + 'px">' + marks + vitals + dot + caption + tip + "</button>";
  }

  function heroVitalsHtml(item) {
    function on(key) { return item[key] !== false; }
    function cell(label, value, title, show) {
      if (!show || value == null || value === "") return "";
      return '<em title="' + esc(title) + '">' + label + " <b>" + esc(String(value)) + "</b></em>";
    }
    const body = cell("КД", item.ac, "Класс доспеха", on("vitalAc")) +
      cell("ХП", item.hp, "Текущие хиты", on("vitalHp")) +
      cell("ВС", item.pp, "Пассивное восприятие", on("vitalPp")) +
      cell("АН", item.pi, "Пассивный анализ", on("vitalPi"));
    if (!body) return "";
    const look = [];
    const size = Math.min(28, Math.max(10, Number(item.vitalSize) || 13));
    look.push("font-size:" + size + "px");
    const stroke = Math.min(8, Math.max(0, Number(item.strokeWidth) || 0));
    if (stroke > 0) {
      look.push("-webkit-text-stroke:" + stroke + "px " + esc(item.stroke || "#1a140c"));
      look.push("paint-order:stroke fill");
      look.push("text-shadow:none");
    }
    if (item.plate) {
      look.push("background:" + esc(item.plate));
      look.push("padding:1px 5px");
      look.push("border-radius:4px");
      look.push("text-shadow:none");
    }
    return '<span class="pin-vitals" style="' + look.join(";") + '">' + body + "</span>";
  }

  function labelHtml(item) {
    const style = "left:" + (item.x * 100) + "%;top:" + (item.y * 100) + "%;" + captionCss(item, 28);
    return '<button type="button" class="map-label" data-pin="' + esc(item.id) + '" data-kind="label" style="' + style + '">' + esc(item.text || "") + "</button>";
  }

  function onLevel(list, here, key) {
    return (list || []).filter(function (item) { return ((item && item[key]) || "") === here; });
  }

  function levelImage(current, places) {
    const id = current.focusId || "";
    const loc = id ? (current.locations || []).find(function (item) { return item.id === id; }) : null;
    const sheet = loc || current;
    const night = sheet.mode === "night";
    const place = loc && loc.placeId && Array.isArray(places)
      ? places.find(function (row) { return row && row.id === loc.placeId; })
      : null;
    const backdrop = place && place.backdrop || "";
    const image = night ? (sheet.night || sheet.day || backdrop || "") : (sheet.day || backdrop || "");
    return { image: image, dim: night && !sheet.night && !backdrop };
  }

  function tabList(current) {
    const here = current.focusId || "";
    const locs = current.locations || [];
    function byId(id) {
      return locs.find(function (item) { return item.id === id; });
    }
    const tabs = [{ id: "", name: current.name || "Карта", on: !here }];
    const crumbs = [];
    let id = here;
    let guard = 0;
    while (id && guard < 24) {
      const loc = byId(id);
      if (!loc) break;
      crumbs.unshift(loc);
      id = loc.parentId || "";
      guard += 1;
    }
    crumbs.forEach(function (loc) {
      tabs.push({ id: loc.id, name: oneLine(loc.name) || "Локация", on: loc.id === here, hidden: !!loc.hidden });
    });
    locs.filter(function (loc) { return (loc.parentId || "") === here && !loc.trashed && !loc.linkId; }).forEach(function (loc) {
      tabs.push({ id: loc.id, name: oneLine(loc.name) || "Локация", on: false, hidden: !!loc.hidden });
    });
    return tabs;
  }

  function tabHtml(tabs) {
    return '<div class="map-tabs">' + (tabs || []).map(function (tab) {
      return '<button type="button" class="map-tab' + (tab.on ? " is-on" : "") + (tab.hidden ? " is-hidden" : "") + '" data-go="' + esc(tab.id || "") + '">' + esc(tab.name || "Локация") + "</button>";
    }).join("") + "</div>";
  }

  function clampNum(value, min, max, fallback) {
    if (value == null || value === "") return fallback;
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function fitFigure(fig) {
    return {
      x: clampNum(fig && fig.x, -80, 140, 3),
      y: clampNum(fig && fig.y, -80, 140, 2),
      h: clampNum(fig && fig.h, 8, 220, 86)
    };
  }

  function figureOf(record, shop) {
    const own = record && (shop ? record.stall : record.stand);
    const slot = own || (shop && record ? record.stand : null);
    return fitFigure(slot);
  }

  function putFigure(record, shop, fig) {
    if (!record) return;
    record[shop ? "stall" : "stand"] = fitFigure(fig);
  }

  function mapFigureOf(record) {
    const base = figureOf(record, false);
    return fitFigure({
      x: record && record.mapX != null ? record.mapX : base.x,
      y: record && record.mapY != null ? record.mapY : base.y,
      h: record && record.mapH != null ? record.mapH : base.h
    });
  }

  function figureCss(fig) {
    return "left:" + fig.x + "%;bottom:" + fig.y + "%;height:" + fig.h + "%";
  }

  function talkHtml(talk, master) {
    const bg = talk.backdrop ? "url('" + esc(talk.backdrop) + "')" : "none";
    const fig = talk.figure || figureOf(null, false);
    const figure = talk.portrait
      ? '<div class="talk-figure' + (master ? " is-live" : "") + '" style="' + figureCss(fig) + '"' + (master ? ' title="Потяните изображение, чтобы переставить его. Правый клик — размер, реплики и товары"' : "") + '><img alt="" draggable="false" src="' + esc(talk.portrait) + '"></div>'
      : "";
    const reps = master && talk.reps && talk.reps.length
      ? '<div class="talk-reps">' + talk.reps.map(function (rep, index) {
          const on = index === talk.index ? " is-on" : "";
          const look = (rep.ink ? "color:" + esc(rep.ink) + ";" : "") + (rep.plate ? "background:" + esc(rep.plate) + ";" : "") + (rep.font ? "font-family:" + esc(rep.font) + ";" : "");
          return '<button type="button" data-talk="line" data-i="' + index + '" class="' + on + '" style="' + look + '" title="' + esc(rep.text || rep.label) + '">' + esc(rep.label) + "</button>";
        }).join("") + "</div>"
      : "";
    const shopCount = talk.goods && talk.goods.length ? talk.goods.length : 0;
    const shopCols = shopCount > 24 ? 4 : (shopCount > 14 ? 3 : (shopCount > 7 ? 2 : 1));
    const shopFont = window.ShirmoShopFont
      ? window.ShirmoShopFont.size(talk.fontSize)
      : Math.min(28, Math.max(12, Number(talk.fontSize) || 16));
    const fontCtrl = window.ShirmoShopFont ? window.ShirmoShopFont.control(shopFont) : "";
    const goods = talk.shop
      ? '<aside class="talk-shop talk-shop-cols-' + shopCols + '" style="--board-font:' + shopFont + 'px"><div class="talk-shop-head"><b>Товары</b><span class="talk-shop-tools">' + fontCtrl +
        (master ? '<button type="button" class="icon-btn" data-talk="show-goods" title="Показать игрокам" aria-label="Показать игрокам">' + (window.ShirmoGlyph ? window.ShirmoGlyph.cast : "") + "</button>" : "") +
        '</span></div><ul class="talk-shop-grid">' + ((talk.goods && talk.goods.length)
        ? talk.goods.map(function (item) {
            if (!master) {
              const icon = item.icon ? '<img class="shop-icon" alt="" src="' + esc(item.icon) + '">' : "";
              const count = item.qty == null ? "" : '<i class="shop-qty">×' + esc(String(item.qty)) + "</i>";
              const tint = window.ShirmoItems ? window.ShirmoItems.inkOf(item) : (item.ink || "");
              const ink = tint ? ' style="color:' + esc(tint) + '"' : "";
              const note = String(item.note || "").trim();
              return "<li" + ink + ">" + icon + '<span class="board-item"><b>' + esc(item.name || "Предмет") + "</b>" +
                (note ? '<small class="board-note">' + esc(note) + "</small>" : "") +
                "</span>" + count + "<em>" + esc(item.priceText || item.price || "") + "</em></li>";
            }
            const g = window.ShirmoGlyph || {};
            const open = !!item.open;
            const eye = item.off ? g.hide : g.eye;
            const eyeTitle = item.off ? "Показать товар игрокам" : "Скрыть товар от игроков";
            const mark = ' data-id="' + esc(item.id || "") + '"';
            const tint = window.ShirmoItems ? window.ShirmoItems.inkOf(item) : (item.ink || "");
            const ink = tint ? ' style="color:' + esc(tint) + '"' : "";
            const face = item.icon ? '<img alt="" src="' + esc(item.icon) + '">' : (g.bag || "");
            return '<li class="shop-item' + (item.off ? " is-off" : "") + (item.hidden ? " is-gone" : "") + '"' + ink + ' data-good="' + esc(item.id || "") + '">' +
              '<div class="shop-head"><button type="button" class="ware-face shop-icon" data-shop-edit' + mark + ' title="Иконка и редкость" aria-label="Иконка и редкость">' + face + "</button>" +
              '<div class="shop-title"><span>' + esc(item.name || "Предмет") + "</span>" +
              '<input data-shop="note"' + mark + ' type="text" value="' + esc(item.note || "") + '" placeholder="Заметка" aria-label="Заметка"></div>' +
              '<div class="shop-acts">' +
              '<button type="button" class="icon-btn" data-shop-edit' + mark + ' title="Редактировать товар" aria-label="Редактировать товар">' + (g.pencil || "") + "</button>" +
              '<button type="button" class="icon-btn shop-fold" data-shop-fold' + mark + ' aria-expanded="' + (open ? "true" : "false") + '" title="Параметры товара" aria-label="Параметры товара">' + (g.fold || "") + "</button>" +
              '<button type="button" class="icon-btn' + (item.off ? " is-off" : "") + '" data-shop-eye' + mark + ' title="' + eyeTitle + '" aria-label="' + eyeTitle + '">' + (eye || "") + "</button>" +
              "</div></div>" +
              '<div class="shop-more"' + (open ? "" : " hidden") + ">" +
              (window.ShirmoCoins ? window.ShirmoCoins.fields(item, talk.campaign, 'data-shop="price"' + mark, 'data-shop="coin"' + mark) : "") +
              '<input data-shop="qty"' + mark + ' class="num shop-qty" type="number" min="0" value="' + (item.qty == null || item.qty === "" ? "" : esc(String(item.qty))) + '" placeholder="∞" title="Количество. Пустое поле — без ограничения" aria-label="Количество">' +
              '<label class="check icon-btn" title="Скрывать у игроков, когда количество станет нулём">' + (g.hide || "") + '<input data-shop-hide' + mark + ' type="checkbox"' + (item.hideEmpty ? " checked" : "") + ' aria-label="Скрывать при нуле"></label>' +
              "</div></li>";
          }).join("")
        : '<li class="note">У персонажа пока нет товаров.</li>') + "</ul></aside>"
      : "";
    const glyph = window.ShirmoGlyph || { speech: "", bag: "" };
    const top = master
      ? '<div class="talk-top"><button type="button" data-talk="talk" class="' + (talk.shop ? "" : "is-on") + '" title="Вернуться к разговору">К разговору</button>' +
        '<button type="button" data-talk="trade" class="' + (talk.shop ? "is-on" : "") + '" title="Открыть торговлю. Изображение можно поставить отдельно">Торговля</button>' +
        '<button type="button" data-talk="back" title="Вернуться на карту">На карту</button></div>'
      : "";
    const moodList = master
      ? '<div class="talk-mood-list" hidden><button type="button" data-talk="mood-auto" class="' + (talk.hold ? "" : "is-on") + '" title="По реплике. Если у реплики нет своей фазы — эмоция по умолчанию">−</button>' +
        (talk.phases || []).map(function (phase, index) {
          const on = talk.hold && phase.on ? " is-on" : "";
          return '<button type="button" data-talk="phase" data-i="' + index + '" class="' + on + '" title="Закрепить эту эмоцию. Реплики её не сменят" aria-label="Фаза ' + (index + 1) + '">' + esc(phase.emoji || String(index + 1)) + "</button>";
        }).join("") + "</div>"
      : "";
    const face = !master ? "" : (talk.emoji || (talk.hold ? "·" : "−"));
    const mood = master
      ? '<div class="talk-mood"><button type="button" data-talk="mood" title="Список эмоций. Минус — по реплике" aria-label="Эмоция">' + esc(face) + "</button>" + moodList + "</div>"
      : "";
    const linesBtn = master
      ? '<button type="button" class="talk-ico" data-talk="lines" title="Реплики: выбор на панели, здесь текст, цвет и смена фазы" aria-label="Реплики">' + glyph.speech + "</button>"
      : "";
    const wareBtn = master
      ? '<button type="button" class="talk-ico talk-ware" data-talk="ware" title="Товары. Если персонаж ещё не торговец, он им станет" aria-label="Товары">' + glyph.bag + "</button>"
      : "";
    return '<div class="stage talk-stage is-talk' + (talk.shop ? " is-shop" : "") + '" style="background-image:' + bg + '">' + top + figure + goods +
      '<div class="talk-box">' + wareBtn + '<div class="talk-name">' + mood + "<b>" + esc(talk.name || "НПС") + "</b>" + linesBtn + "</div><p>" + esc(talk.line || "...") + "</p>" + reps + "</div></div>";
  }

  function html(view, master) {
    const source = view || {};
    if (source.talk) return talkHtml(source.talk, master);
    const image = (source.mode === "night" && source.night) ? source.night : (source.day || "");
    const dim = source.mode === "night" && !source.night;
    const strokes = (source.strokes || []).map(strokeSvg).join("");
    const locations = (source.locations || []).map(function (item) { return pinHtml(item, "loc", master); }).join("");
    const markers = (source.markers || []).map(function (item) {
      const kind = item.kind === "npc" ? "npc" : (item.kind === "foe" ? "foe" : (item.kind === "hero" ? "hero" : (item.kind === "image" ? "image" : "mark")));
      if (kind === "npc" && item.portrait && item.look !== "token") {
        const fig = fitFigure(item.stand);
        const marks = master
          ? '<span class="pin-flags">' + flagMark("screen", shownScreen(item)) + flagMark("map", shownMap(item)) + "</span>"
          : "";
        const caption = item.showName === true ? "<b>" + esc(item.name || "НПС") + "</b>" : "";
        return '<button type="button" class="map-figure' + (item.hidden ? " is-hidden" : "") + '" data-pin="' + esc(item.id) + '" data-kind="npc" data-figure="1" style="' + figureCss(fig) + '" aria-label="' + esc(item.name || "НПС") + '"' + (master ? ' title="Открыть диалог"' : "") + ">" +
          marks + '<img alt="" draggable="false" src="' + esc(item.portrait) + '">' + caption + "</button>";
      }
      return pinHtml(item, kind, master);
    }).join("");
    const labels = (source.labels || []).map(labelHtml).join("");
    const face = faces(source);
    const bar = master && source.flags ? flagBar(source.flags) : "";
    const back = !master && source.up != null
      ? '<button type="button" class="map-back" data-up="' + esc(source.up || "") + '" title="На уровень выше">Назад</button>'
      : "";
    return (face ? "<style>" + face + "</style>" : "") +
      '<div class="stage map-stage' + (bar ? (source.flags.bare ? " has-lamp" : " has-flags") : "") + '">' +
      back +
      (master ? tabHtml(source.tabs) : "") +
      bar +
      '<div class="map-photo' + (dim ? " is-night" : "") + '" style="background-image:' + (image ? "url('" + esc(image) + "')" : "none") + '"></div>' +
      '<svg class="map-ink" viewBox="0 0 100 100" preserveAspectRatio="none">' + strokes + "</svg>" +
      locations + markers + labels + "</div>";
  }

  function closeZoomImage() {
    const old = document.getElementById("map-image-zoom");
    if (!old) return;
    const hide = old._onClose;
    old._onClose = null;
    old.remove();
    if (typeof hide === "function") hide();
  }

  function zoomImage(url, forceOpen, onClose) {
    const src = String(url || "").trim();
    const old = document.getElementById("map-image-zoom");
    if (old) {
      old._onClose = null;
      old.remove();
      if (!forceOpen) {
        if (typeof onClose === "function") onClose();
        return;
      }
    }
    if (!src) return;
    const pop = document.createElement("div");
    pop.id = "map-image-zoom";
    pop.className = "map-image-zoom";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Картинка");
    pop.innerHTML = '<img alt="" src="' + esc(src) + '">';
    if (typeof onClose === "function") pop._onClose = onClose;
    pop.addEventListener("click", function () { closeZoomImage(); });
    document.body.appendChild(pop);
  }

  function bindImages(root) {
    if (!root || root._mapImageBound) return;
    root._mapImageBound = true;
    root.addEventListener("click", function (event) {
      const pin = event.target.closest && event.target.closest(".map-pin.image");
      if (!pin || !root.contains(pin)) return;
      if (event.target.closest && event.target.closest("[data-flag]")) return;
      const img = pin.querySelector("img");
      const src = img && (img.getAttribute("src") || img.src);
      if (!src) return;
      event.preventDefault();
      event.stopPropagation();
      zoomImage(src);
    });
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

  const ACT = {
    del: icon('<path d="M6 7h12M9 7V5h6v2M8 7l1 13h6l1-13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'),
    copy: icon('<rect x="8" y="8" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 16V6h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'),
    move: icon('<path d="M12 4v16M4 12h16M12 4l-2.4 2.4M12 4l2.4 2.4M12 20l-2.4-2.4M12 20l2.4-2.4M4 12l2.4-2.4M4 12l2.4 2.4M20 12l-2.4-2.4M20 12l-2.4 2.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    rehome: icon('<path d="M4 11l8-7 8 7M6 10.5V19h4v-5h4v5h4v-8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M15 4h4v4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'),
    rename: icon('<path d="M4 20l4-1 11-11-3-3L5 16z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'),
    book: icon('<path d="M5 5.5h5.5A2.5 2.5 0 0113 8v11H8a3 3 0 00-3 3zM19 5.5h-5.5A2.5 2.5 0 0011 8v11h5a3 3 0 013 3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'),
    setup: icon('<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M5.8 5.8l1.4 1.4M16.8 16.8l1.4 1.4M18.2 5.8l-1.4 1.4M7.2 16.8l-1.4 1.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    unsquad: icon('<circle cx="8" cy="9" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="15" cy="9" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 18c.6-2 2-3 4-3M12 18c.6-2 2-3 4-3M16 15l5 5M21 15l-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>')
  };

  const TOOLS = [
    ["choose", "Выбор", icon('<path d="M5 3l6 16 2-6 6-2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>')],
    ["loc", "Локация", icon('<path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="11" r="1.6" fill="currentColor"/>')],
    ["mark", "Метка", icon('<path d="M12 3l7 9-7 9-7-9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>')],
    ["npc", "НПС", icon('<circle cx="12" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 19c1.2-3 3.2-4.5 6-4.5S16.8 16 18 19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>')],
    ["hero", "Герой", icon('<path d="M12 3l7 3v6c0 4.2-3 7.2-7 9-4-1.8-7-4.8-7-9V6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>')],
    ["image", "Картинка", icon('<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8.5" cy="10" r="1.4" fill="currentColor"/><path d="M3 16l5-4 4 3 3-2 6 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>')],
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
    if (window.ShirmoCodex && window.ShirmoCodex.adopt && window.ShirmoCodex.adopt(ctx.campaign) && ctx.save) ctx.save();
    const page = ctx.page;
    let tool = "choose";
    let selected = null;
    let skipClick = 0;
    let shownForm = "";
    let pendingParent = "";
    let drag = null;
    let figureDrag = null;
    let press = null;
    let armedMove = false;
    let reopen = false;
    let draw = null;
    let erasing = false;
    let past = [];
    let future = [];
    let timer = 0;
    let binOpen = false;
    let setupEl = null;
    let heroPick = "";

    host.innerHTML = '<aside class="side map-side">' +
      '<div class="map-viewbar">' +
      '<select id="map-view" aria-label="Вид" title="Какой вид карты открыт"></select>' +
      '<button type="button" id="map-view-add" title="Новый вид карты" aria-label="Новый вид">' + icon('<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>') + "</button>" +
      '<button type="button" id="map-view-del" title="Удалить текущий вид" aria-label="Удалить вид">' + icon('<path d="M6 7h12M9 7V5h6v2M8 7l1 13h6l1-13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>') + "</button>" +
      '<button type="button" id="map-setup" title="Имя, день и ночь, фоны этого места" aria-label="Настройки карты">' + ACT.setup + "</button></div>" +
      '<div class="map-tools" id="map-tools"></div>' +
      '<div class="map-draw">' +
      '<button type="button" id="map-undo" title="Отменить последний штрих" aria-label="Отмена">' + icon('<path d="M8 8H5v3M5.5 10A7 7 0 1 1 6 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>') + "</button>" +
      '<button type="button" id="map-redo" title="Вернуть отменённый штрих" aria-label="Повтор">' + icon('<path d="M16 8h3v3M18.5 10A7 7 0 1 0 18 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>') + "</button>" +
      '<input id="map-ink" type="color" value="#e6c36a" aria-label="Цвет линии" title="Цвет кисти и фигур">' +
      '<input id="map-width" type="range" min="1" max="16" value="3" aria-label="Толщина" title="Толщина линии">' +
      '<button type="button" id="map-day" title="Дневной вид этого места" aria-label="День">' + icon('<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M18 6l-1.4 1.4M7.4 16.6L6 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>') + "</button>" +
      '<button type="button" id="map-night" title="Ночной вид этого места" aria-label="Ночь">' + icon('<path d="M16 14.5A6.5 6.5 0 0 1 9.2 6 6.5 6.5 0 1 0 16 14.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>') + "</button></div>" +
      '<div id="map-label-box" hidden>' +
      '<label title="Текст, который встанет на карту">Текст<input id="map-label" type="text" placeholder="Надпись"></label>' +
      '<label title="Шрифт новой надписи">Шрифт<select id="map-font"></select></label>' +
      '<div class="row"><button type="button" id="map-bold" title="Жирный">Ж</button><button type="button" id="map-italic" title="Курсив">К</button><button type="button" id="map-under" title="Подчёркнутый">Ч</button></div>' +
      '<label title="Размер новой надписи">Размер<input id="map-label-size" type="range" min="14" max="96" value="28"></label></div>' +
      '<div id="map-image-box" hidden>' +
      '<label title="Картинка из библиотеки">Из библиотеки<select id="map-image-lib" data-shelf="image"><option value="">Выберите картинку</option></select></label>' +
      '<label class="file-btn" title="Загрузить картинку на карту">Загрузить<input type="file" id="map-image-file" accept="image/*" aria-label="Загрузить картинку"></label>' +
      '<label title="Размер новой картинки на карте">Размер<input id="map-image-size" type="range" min="32" max="400" value="120"></label>' +
      '<p class="note">Клик по карте ставит выбранную картинку. Потом можно скрыть или изменить размер.</p></div>' +
      '<div id="map-ping-box" hidden><label title="Как выглядит вспышка пинга">Пинг<select id="map-ping"><option value="rings">Круги</option><option value="flash">Вспышка</option><option value="lights">Огоньки</option></select></label></div>' +
      '<div id="map-hero-box" hidden><p class="note">Выберите героя и кликните по карте. Он встанет в открытую локацию.</p><div id="map-hero-list"></div></div>' +
      '<div class="map-tree-head"><span>Локации</span>' +
      '<button type="button" id="map-loc-add" title="Новая локация на текущей карте" aria-label="Добавить локацию">' + icon('<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>') + "</button>" +
      '<button type="button" id="map-bin" title="Локации с данными, которые вы убрали" aria-label="Корзина">' + icon('<path d="M5 8h14M9 8V6h6v2M8 8l1 12h6l1-12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>') + '<b id="map-bin-n"></b></button></div>' +
      '<div id="map-tree"></div>' +
      '<div id="map-bin-list" hidden></div>' +
      '<p class="note" id="map-hint">Левый клик открывает локацию или разговор, правый — правку. Скрытые точки видите только вы.</p>' +
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
    function enter(id) {
      const current = view();
      if (id) {
        const loc = current.locations.find(function (item) { return item.id === id; });
        if (!loc || loc.trashed) return;
        const target = doorTarget(loc);
        id = target ? target.id : id;
      }
      current.focusId = id || "";
      current.talkId = "";
      skipClick = Date.now() + 400;
      selected = null;
      closeMenu();
      closeSetup();
      paintBoard();
      paintTools();
      paintTree();
      paintSelected();
      ctx.save();
      tellLight();
    }
    function tellLight() {
      try {
        if (!window.ShirmoPlugins || !window.ShirmoPlugins.place) return;
        const current = view();
        const shot = levelImage(current, book().places);
        const inside = current.focusId
          ? (current.locations || []).find(function (item) { return item.id === current.focusId && !item.trashed; })
          : null;
        const sheet = inside || current;
        window.ShirmoPlugins.place(sheet, shot.image || "");
      } catch (err) {}
    }
    function paintBoard() {
      const current = view();
      if (current.talkId) {
        const marker = (current.markers || []).find(function (item) { return item.id === current.talkId && item.kind === "npc"; });
        if (marker) {
          board.innerHTML = html({ talk: talkView(marker) }, true);
          if (window.ShirmoFit) window.ShirmoFit(board);
          bindTalk(marker);
          return;
        }
        current.talkId = "";
      }
      if (foldDoors()) dirty();
      const here = current.focusId || "";
      const shot = levelImage(current, book().places);
      const draft = draw ? [draw] : [];
      const inside = here ? (current.locations || []).find(function (item) { return item.id === here && !item.trashed; }) : null;
      board.innerHTML = html({
        day: shot.image,
        night: "",
        mode: shot.dim ? "night" : "day",
        flags: inside
          ? { screen: shownScreen(inside), map: shownMap(inside), loc: inside }
          : { loc: current, bare: true },
        tabs: tabList(current),
        locations: onLevel(current.locations, here, "parentId").filter(function (item) { return !item.trashed; }).map(function (item) {
          const place = item.placeId && (book().places || []).find(function (row) { return row.id === item.placeId; });
          const target = item.linkId ? findLoc(item.linkId) : null;
          const named = (target && target.name) || item.name;
          const room = item.linkId ? (doorTarget(item) || target || item) : item;
          const portrait = item.portrait || (target && target.portrait) || (place && place.portrait) || "";
          if (!portrait && named === item.name && !item.linkId) return item;
          return Object.assign({}, item, {
            name: named,
            door: !!item.linkId,
            lamp: room.lamp === true,
            lampColor: room.lampColor || "",
            lampSrc: room.lampSrc || "",
            lampBright: room.lampBright,
            portrait: portrait,
            portraitX: item.portraitX != null ? item.portraitX : (target && target.portraitX != null ? target.portraitX : place && place.portraitX),
            portraitY: item.portraitY != null ? item.portraitY : (target && target.portraitY != null ? target.portraitY : place && place.portraitY),
            portraitZoom: item.portraitZoom || (target && target.portraitZoom) || (place && place.portraitZoom) || 1
          });
        }),
        markers: onLevel(current.markers, here, "locId").map(function (item) {
          const face = faceOf(item);
          const faced = face ? Object.assign({}, item, {
            portrait: face.url,
            portraitX: face.x,
            portraitY: face.y,
            portraitZoom: face.zoom,
            emoji: face.emoji || "",
            look: face.look || "",
            stand: face.stand || null
          }) : item;
          const vitals = heroSheet(item);
          return vitals ? Object.assign({}, faced, vitals) : faced;
        }),
        labels: onLevel(current.labels, here, "locId"),
        strokes: onLevel(current.strokes, here, "locId").concat(draft)
      }, true);
      if (window.ShirmoFit) window.ShirmoFit(board);
      const stage = board.querySelector(".stage");
      if (stage) stage.classList.toggle("is-erase", tool === "erase");
      tellLight();
    }
    function passiveSkill(hero, id, names, statId) {
      const skill = (hero.skills || []).find(function (row) {
        if (!row) return false;
        const name = String(row.name || "").trim().toLowerCase();
        return row.id === id || names.indexOf(name) >= 0;
      });
      if (skill) return 10 + Math.round(Number(skill.bonus) || 0);
      const stat = (hero.stats || []).find(function (row) { return row && row.id === statId; });
      return stat ? 10 + Math.round(Number(stat.mod) || 0) : null;
    }
    function heroSheet(item) {
      if (!item || item.kind !== "hero" || !item.heroId) return null;
      const hero = (book().heroes || []).find(function (row) { return row && row.id === item.heroId; });
      if (!hero) return null;
      const hp = hero.hp != null && hero.hp !== "" ? Math.round(Number(hero.hp) || 0) : null;
      return {
        ac: Math.round(Number(hero.ac) || 0),
        hp: hp,
        pp: passiveSkill(hero, "perception", ["восприятие", "внимательность"], "wis"),
        pi: passiveSkill(hero, "investigation", ["анализ", "расследование"], "int")
      };
    }
    function paintTools() {
      host.querySelector("#map-tools").innerHTML = TOOLS.map(function (item) {
        return '<button type="button" data-tool="' + item[0] + '" class="' + (tool === item[0] ? "is-on" : "") + '" title="' + esc(item[1]) + '" aria-label="' + esc(item[1]) + '">' + item[2] + "</button>";
      }).join("");
      const stage = board.querySelector(".stage");
      if (stage) stage.classList.toggle("is-erase", tool === "erase");
      const sheet = levelSheet();
      host.querySelector("#map-day").classList.toggle("is-on", sheet.mode !== "night");
      host.querySelector("#map-night").classList.toggle("is-on", sheet.mode === "night");
      host.querySelector("#map-label-box").hidden = tool !== "label";
      host.querySelector("#map-image-box").hidden = tool !== "image";
      host.querySelector("#map-ping-box").hidden = tool !== "ping";
      host.querySelector("#map-hero-box").hidden = tool !== "hero";
      if (tool === "hero") paintHeroList();
      host.querySelector("#map-bold").classList.toggle("is-on", styleBold);
      host.querySelector("#map-italic").classList.toggle("is-on", styleItalic);
      host.querySelector("#map-under").classList.toggle("is-on", styleUnderline);
      if (tool === "image") fillImageLib();
    }
    function paintHeroList() {
      const box = host.querySelector("#map-hero-list");
      if (!box) return;
      const heroes = book().heroes || [];
      if (!heroes.length) {
        box.innerHTML = '<p class="note">В справочнике нет героев. Загрузите лист на вкладке «Герои».</p>';
        return;
      }
      if (heroPick && !heroes.some(function (row) { return row && row.id === heroPick; })) heroPick = "";
      box.innerHTML = heroes.map(function (hero) {
        const on = hero.id === heroPick ? " is-on" : "";
        const face = hero.portrait ? '<img alt="" src="' + esc(hero.portrait) + '">' : "<i></i>";
        return '<button type="button" class="map-hero-pick' + on + '" data-hero="' + esc(hero.id) + '">' + face + "<span>" + esc(hero.name || "Герой") + "</span></button>";
      }).join("");
    }
    function placeHeroAt(at) {
      const heroes = book().heroes || [];
      const hero = heroes.find(function (row) { return row && row.id === heroPick; });
      const hint = host.querySelector("#map-hint");
      if (!hero) {
        if (hint) hint.textContent = heroes.length ? "Сначала выберите героя слева." : "В справочнике нет героев. Загрузите лист на вкладке «Герои».";
        return;
      }
      const current = view();
      let marker = (current.markers || []).find(function (row) {
        return row && row.kind === "hero" && row.heroId === hero.id;
      });
      if (!marker) {
        marker = {
          id: crypto.randomUUID(),
          kind: "hero",
          heroId: hero.id,
          tip: hero.title || "",
          hidden: false,
          pinSize: 56
        };
        current.markers.push(marker);
      }
      marker.name = hero.name || "Герой";
      marker.x = at.x;
      marker.y = at.y;
      marker.locId = current.focusId || "";
      marker.portrait = hero.portrait || "";
      if (hero.portraitX != null) marker.portraitX = hero.portraitX;
      if (hero.portraitY != null) marker.portraitY = hero.portraitY;
      if (hero.portraitZoom != null) marker.portraitZoom = hero.portraitZoom;
      selected = { kind: "hero", id: marker.id };
      shownForm = "";
      const loc = marker.locId ? findLoc(marker.locId) : null;
      if (hint) hint.textContent = loc
        ? "Герой стоит в «" + (loc.name || "локация") + "». Правый клик — размер и перенос."
        : "Герой стоит на корне карты. Откройте локацию и кликните ещё раз, чтобы перенести его внутрь.";
      paintBoard();
      paintTree();
      paintSelected();
      ctx.save();
    }
    function fillImageLib(selectedUrl) {
      const pick = host.querySelector("#map-image-lib");
      if (!pick) return;
      const images = (ctx.library().images) || [];
      const cur = selectedUrl != null ? selectedUrl : pick.value;
      pick.innerHTML = '<option value="">Выберите картинку</option>' + images.map(function (image) {
        return '<option value="' + esc(image.url) + '"' + (image.url === cur ? " selected" : "") + ">" + esc(image.name || "Картинка") + "</option>";
      }).join("");
      if (cur) pick.value = cur;
      if (window.ShirmoShelf) window.ShirmoShelf.arm(host);
    }
    function treeHtml(parentId, depth) {
      return view().locations.filter(function (item) { return (item.parentId || "") === parentId && !item.trashed && !item.linkId; }).map(function (item) {
        const on = (view().focusId || "") === item.id ? " is-on" : "";
        const ico = function (act, label, body) {
          return '<button type="button" class="map-ico" data-act="' + act + '" data-id="' + esc(item.id) + '" title="' + label + '" aria-label="' + label + '">' + body + "</button>";
        };
        return '<div class="map-node" style="padding-left:' + (depth * 14) + 'px"><button type="button" class="map-loc' + on + '" data-loc="' + esc(item.id) + '" title="Открыть эту локацию">' + esc(oneLine(item.name) || "Локация") + "</button>" +
          ico("setup", "Имя, подсказка, день и ночь, фоны", ACT.setup) +
          ico("add", "Добавить локацию внутри этой", icon('<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>')) +
          ico("del", "Убрать. Если есть данные — в корзину", icon('<path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>')) +
          "</div>" + treeHtml(item.id, depth + 1);
      }).join("");
    }
    function paintTree() {
      if (foldDoors()) dirty();
      const htmlTree = treeHtml("", 0);
      host.querySelector("#map-tree").innerHTML = htmlTree || '<p class="roll-empty">Локаций нет</p>';
      paintBin();
    }
    function levelSheet() {
      const current = view();
      const id = current.focusId || "";
      if (!id) return current;
      return current.locations.find(function (item) { return item.id === id; }) || current;
    }
    function findLoc(id) {
      return view().locations.find(function (item) { return item.id === id; }) || null;
    }
    function subtree(id) {
      const ids = {};
      function walk(locId) {
        ids[locId] = true;
        view().locations.forEach(function (loc) {
          if ((loc.parentId || "") === locId) walk(loc.id);
        });
      }
      walk(id);
      return ids;
    }
    function hasStuff(id) {
      const current = view();
      const ids = subtree(id);
      if (Object.keys(ids).length > 1) return true;
      const loc = findLoc(id);
      if (loc && (loc.day || loc.night || String(loc.tip || "").trim())) return true;
      return ["markers", "labels", "strokes"].some(function (key) {
        return (current[key] || []).some(function (row) { return row && ids[row.locId]; });
      });
    }
    function leaveFocus(ids, parentId) {
      const current = view();
      if (!ids[current.focusId]) return;
      current.focusId = ids[parentId] ? "" : (parentId || "");
    }
    function purge(id) {
      const current = view();
      const loc = findLoc(id);
      const ids = subtree(id);
      leaveFocus(ids, loc ? loc.parentId || "" : "");
      ["markers", "labels", "strokes"].forEach(function (key) {
        current[key] = (current[key] || []).filter(function (row) { return !(row && ids[row.locId]); });
      });
      current.locations = current.locations.filter(function (item) { return !ids[item.id]; });
      if (selected && ids[selected.id]) selected = null;
    }
    function placeMates(loc) {
      if (!loc || !loc.placeId || loc.linkId) return [];
      return view().locations.filter(function (item) {
        return item && item.id !== loc.id && !item.trashed && !item.linkId && item.placeId === loc.placeId;
      });
    }
    function canonLoc(loc) {
      if (!loc || !loc.placeId || loc.linkId) return loc;
      const mates = [loc].concat(placeMates(loc));
      if (mates.length < 2) return loc;
      const current = view();
      const order = current.locations || [];
      function weight(item) {
        let score = 0;
        order.forEach(function (row) {
          if (row && !row.trashed && !row.linkId && (row.parentId || "") === item.id) score += 4;
        });
        (current.markers || []).forEach(function (row) {
          if (row && (row.locId || "") === item.id) score += 2;
        });
        (current.labels || []).forEach(function (row) {
          if (row && (row.locId || "") === item.id) score += 1;
        });
        if (item.day || item.night || String(item.tip || "").trim()) score += 1;
        return score;
      }
      let best = mates[0];
      let bestAt = order.indexOf(best);
      let score = weight(best);
      mates.forEach(function (item) {
        const next = weight(item);
        const at = order.indexOf(item);
        if (next > score || (next === score && at >= 0 && (bestAt < 0 || at < bestAt))) {
          best = item;
          score = next;
          bestAt = at;
        }
      });
      return best;
    }
    function doorTarget(loc, seen) {
      if (!loc) return null;
      seen = seen || {};
      if (seen[loc.id]) return null;
      seen[loc.id] = true;
      let next = null;
      if (loc.linkId) next = findLoc(loc.linkId);
      if ((!next || next.trashed) && loc.placeId && !loc.linkId) {
        const canon = canonLoc(loc);
        if (canon && canon.id !== loc.id) next = canon;
      }
      if (!next || next.trashed || next.id === loc.id) return null;
      return doorTarget(next, seen) || next;
    }
    function foldDoors() {
      let changed = false;
      (view().locations || []).forEach(function (loc) {
        if (!loc || loc.trashed || loc.linkId) return;
        const target = doorTarget(loc);
        if (!target) return;
        retargetInterior(loc.id, target.id);
        loc.linkId = target.id;
        changed = true;
      });
      const focus = view().focusId || "";
      const open = focus && findLoc(focus);
      const target = open && doorTarget(open);
      if (target && view().focusId !== target.id) {
        view().focusId = target.id;
        changed = true;
      }
      return changed;
    }
    function roomForPlace(placeId, exceptId) {
      if (!placeId) return null;
      const locs = (view().locations || []).filter(function (loc) {
        return loc && loc.id !== exceptId && !loc.trashed && !loc.linkId && loc.placeId === placeId;
      });
      if (!locs.length) return null;
      return canonLoc(locs[0]) || locs[0];
    }
    function retargetInterior(fromId, toId) {
      if (!fromId || !toId || fromId === toId) return;
      const current = view();
      current.locations.forEach(function (item) {
        if (item && (item.parentId || "") === fromId) item.parentId = toId;
      });
      ["markers", "labels", "strokes"].forEach(function (key) {
        (current[key] || []).forEach(function (row) {
          if (row && (row.locId || "") === fromId) row.locId = toId;
        });
      });
      if ((current.focusId || "") === fromId) current.focusId = toId;
    }
    function dropLocation(id) {
      const loc = findLoc(id);
      if (!loc || loc.trashed) return;
      const door = loc.linkId ? findLoc(loc.linkId) : null;
      if (loc.linkId || doorTarget(loc)) {
        const target = door && !door.trashed ? door : doorTarget(loc);
        if (target) retargetInterior(id, target.id);
        view().locations = view().locations.filter(function (item) { return item.id !== id; });
        if ((view().focusId || "") === id) view().focusId = target ? target.id : (loc.parentId || "");
        if (selected && selected.kind === "loc" && selected.id === id) selected = null;
        closeMenu();
        closeSetup();
        paintBoard();
        paintTree();
        ctx.save();
        return;
      }
      const ids = subtree(id);
      if (hasStuff(id)) loc.trashed = true;
      else {
        forgetPlace(loc);
        view().locations = view().locations.filter(function (item) { return item.id !== id; });
      }
      leaveFocus(ids, loc.parentId || "");
      if (selected && selected.kind === "loc" && ids[selected.id]) selected = null;
      closeMenu();
      closeSetup();
      paintBoard();
      paintTree();
      ctx.save();
    }
    function addLocation(parentId) {
      const current = view();
      const parent = parentId || "";
      const siblings = current.locations.filter(function (item) {
        return (item.parentId || "") === parent && !item.trashed;
      });
      const n = siblings.length;
      const id = crypto.randomUUID();
      current.locations.push({
        id: id,
        parentId: parent,
        name: "Локация",
        x: Math.min(0.88, 0.16 + (n % 6) * 0.12),
        y: Math.min(0.82, 0.2 + Math.floor(n / 6) * 0.14),
        tip: "",
        hidden: true,
        day: "",
        night: "",
        mode: "day",
        trashed: false
      });
      ensurePlace(current.locations[current.locations.length - 1]);
      paintBoard();
      paintTree();
      ctx.save();
      openSetup(id);
    }
    function paintBin() {
      const box = host.querySelector("#map-bin-list");
      const rows = view().locations.filter(function (item) { return item.trashed; });
      const badge = host.querySelector("#map-bin-n");
      badge.textContent = rows.length ? String(rows.length) : "";
      host.querySelector("#map-bin").classList.toggle("is-on", binOpen);
      if (!binOpen) {
        box.hidden = true;
        box.innerHTML = "";
        return;
      }
      box.hidden = false;
      box.innerHTML = rows.length ? rows.map(function (item) {
        return '<div class="map-bin-row"><span>' + esc(item.name || "Локация") + "</span>" +
          '<button type="button" data-bin="back" data-id="' + esc(item.id) + '" title="Вернуть локацию на карту">Вернуть</button>' +
          '<button type="button" class="map-ico" data-bin="gone" data-id="' + esc(item.id) + '" title="Удалить навсегда" aria-label="Удалить навсегда">' + icon('<path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>') + "</button></div>";
      }).join("") : '<p class="roll-empty">Корзина пуста</p>';
    }
    function closeSetup() {
      if (setupEl) setupEl.remove();
      setupEl = null;
    }
    function openSetup(id) {
      closeSetup();
      closeMenu();
      const current = view();
      const loc = id ? findLoc(id) : null;
      if (id && !loc) return;
      if (loc) {
        const target = doorTarget(loc);
        if (target) loc = target;
      }
      const sheet = loc || current;
      const images = ctx.library().images || [];
      function options(selectedUrl) {
        return '<option value="">Нет</option>' + images.map(function (item) {
          return '<option value="' + esc(item.url) + '"' + (item.url === selectedUrl ? " selected" : "") + ">" + esc(item.name) + "</option>";
        }).join("");
      }
      const pop = document.createElement("div");
      pop.className = "pop";
      pop.innerHTML = '<div class="pop-card map-setup" role="dialog" aria-label="Настройки">' +
        '<div class="pop-head"><h2>' + esc(loc ? (oneLine(loc.name) || "Локация") : "Карта") + '</h2><button type="button" data-pop-close title="Закрыть" aria-label="Закрыть">×</button></div>' +
        '<details class="drop" open><summary title="Имя, подсказка и видимость">Основное</summary>' +
        '<label title="Название на карте. Enter — новая строка">Название<textarea id="setup-name" rows="2">' + esc(sheet.name || "") + "</textarea></label>" +
        (loc ? '<label title="Текст при наведении на точку локации">Подсказка<textarea id="setup-tip">' + esc(loc.tip || "") + "</textarea></label>" +
          '<label class="check" title="Игроки не видят эту локацию"><input id="setup-hide" type="checkbox"' + (loc.hidden ? " checked" : "") + "> Скрыть от игроков</label>" : "") +
        "</details>" +
        '<details class="drop"><summary title="День, ночь и картинки фона">Вид</summary>' +
        '<div class="row"><button type="button" id="setup-day" class="' + (sheet.mode !== "night" ? "is-on" : "") + '" title="Показать дневной фон">День</button><button type="button" id="setup-night" class="' + (sheet.mode === "night" ? "is-on" : "") + '" title="Показать ночной фон">Ночь</button></div>' +
        '<label title="Картинка, когда у места день">Фон дня<select id="setup-day-img" data-shelf="image">' + options(sheet.day || "") + "</select></label>" +
        '<div class="row"><label class="file-btn" title="Загрузить фон дня, как портрет у персонажа">Загрузить день<input type="file" id="setup-day-file" accept="image/*" aria-label="Загрузить фон дня"></label>' +
        '<button type="button" id="setup-day-clear" title="Убрать фон дня">Убрать</button></div>' +
        '<label title="Картинка, когда у места ночь">Фон ночи<select id="setup-night-img" data-shelf="image">' + options(sheet.night || "") + "</select></label>" +
        '<div class="row"><label class="file-btn" title="Загрузить фон ночи">Загрузить ночь<input type="file" id="setup-night-file" accept="image/*" aria-label="Загрузить фон ночи"></label>' +
        '<button type="button" id="setup-night-clear" title="Убрать фон ночи">Убрать</button></div>' +
        (loc ? '<label title="Картинка точки на карте, как портрет НПС">Портрет точки<select id="setup-face" data-shelf="image">' + options(loc.portrait || "") + "</select></label>" +
          '<div class="row"><label class="file-btn" title="Загрузить портрет точки">Загрузить портрет<input type="file" id="setup-face-file" accept="image/*" aria-label="Загрузить портрет точки"></label>' +
          '<button type="button" id="setup-face-clear" title="Убрать портрет точки">Убрать</button></div>' : "") +
        "</details></div>";
      document.body.appendChild(pop);
      setupEl = pop;
      function setMode(mode) {
        sheet.mode = mode;
        pop.querySelector("#setup-day").classList.toggle("is-on", mode !== "night");
        pop.querySelector("#setup-night").classList.toggle("is-on", mode === "night");
        paintTools();
        paintBoard();
        dirty();
      }
      pop.addEventListener("click", function (event) {
        if (event.target === pop) closeSetup();
      });
      pop.querySelector("[data-pop-close]").addEventListener("click", closeSetup);
      pop.querySelector("#setup-name").addEventListener("input", function (event) {
        sheet.name = event.target.value;
        if (loc && loc.placeId) {
          const place = book().places.find(function (row) { return row.id === loc.placeId; });
          if (place) place.name = sheet.name || "Локация";
        }
        pop.querySelector("h2").textContent = event.target.value || (loc ? "Локация" : "Карта");
        paintBoard();
        paintTree();
        if (!loc) paintLists();
        dirty();
      });
      const tip = pop.querySelector("#setup-tip");
      if (tip) tip.addEventListener("input", function (event) {
        loc.tip = event.target.value;
        paintBoard();
        dirty();
      });
      const hide = pop.querySelector("#setup-hide");
      if (hide) hide.addEventListener("change", function () {
        if (loc.screen == null) loc.screen = !loc.hidden;
        loc.hidden = hide.checked;
        paintBoard();
        paintTree();
        dirty();
      });
      pop.querySelector("#setup-day").addEventListener("click", function () { setMode("day"); });
      pop.querySelector("#setup-night").addEventListener("click", function () { setMode("night"); });
      function linkedPlace() {
        if (!loc || !loc.placeId) return null;
        return (book().places || []).find(function (row) { return row.id === loc.placeId; }) || null;
      }
      function syncPlaceShot(field, url, prev) {
        const place = linkedPlace();
        if (!place) return;
        if (field === "portrait") {
          place.portrait = url || "";
          return;
        }
        if (url) {
          if (!place.backdrop) place.backdrop = url;
          return;
        }
        if (field === "day" || place.backdrop === prev) place.backdrop = field === "day" ? "" : (sheet.day || "");
      }
      function showShot(select, url) {
        if (!select) return;
        select.value = url || "";
      }
      function setShot(field, url) {
        const prev = field === "portrait" ? ((loc && loc.portrait) || "") : (sheet[field] || "");
        const next = url || "";
        const keepDay = sheet.day || "";
        const keepNight = sheet.night || "";
        const placeBefore = linkedPlace();
        const keepBackdrop = (placeBefore && placeBefore.backdrop) || "";
        const keepPortrait = (loc && loc.portrait) || "";
        const keepPlacePortrait = (placeBefore && placeBefore.portrait) || "";
        if (field === "portrait") {
          if (!loc) return;
          loc.portrait = next;
        } else sheet[field] = next;
        syncPlaceShot(field, next, prev);
        if (field === "portrait") {
          sheet.day = keepDay;
          sheet.night = keepNight;
          const place = linkedPlace();
          if (place) place.backdrop = keepBackdrop;
        } else if (loc) {
          loc.portrait = keepPortrait;
          const place = linkedPlace();
          if (place) place.portrait = keepPlacePortrait;
        }
        showShot(pop.querySelector(field === "day" ? "#setup-day-img" : field === "night" ? "#setup-night-img" : "#setup-face"), next);
        paintBoard();
        dirty();
      }
      pop.querySelector("#setup-day-img").addEventListener("change", function (event) {
        setShot("day", event.target.value);
      });
      pop.querySelector("#setup-night-img").addEventListener("change", function (event) {
        setShot("night", event.target.value);
      });
      pop.querySelector("#setup-day-clear").addEventListener("click", function () { setShot("day", ""); });
      pop.querySelector("#setup-night-clear").addEventListener("click", function () { setShot("night", ""); });
      function keepShot(file, apply) {
        if (!file || !ctx.upload) return;
        ctx.upload(file).then(function (url) {
          if (!ctx.campaign.library) ctx.campaign.library = { fonts: [], images: [], notes: [] };
          if (window.ShirmoLib) window.ShirmoLib.keep(ctx.campaign.library, {
            url: url,
            name: file.name.replace(/\.[^.]+$/, ""),
            section: "places",
            sectionName: "Локации"
          });
          apply(url);
          paintBoard();
          dirty();
        });
      }
      pop.querySelector("#setup-day-file").addEventListener("change", function (event) {
        const file = event.target.files && event.target.files[0];
        keepShot(file, function (url) { setShot("day", url); });
      });
      pop.querySelector("#setup-night-file").addEventListener("change", function (event) {
        const file = event.target.files && event.target.files[0];
        keepShot(file, function (url) { setShot("night", url); });
      });
      const facePick = pop.querySelector("#setup-face");
      if (facePick) facePick.addEventListener("change", function (event) {
        setShot("portrait", event.target.value);
      });
      const faceClear = pop.querySelector("#setup-face-clear");
      if (faceClear) faceClear.addEventListener("click", function () { setShot("portrait", ""); });
      const faceFile = pop.querySelector("#setup-face-file");
      if (faceFile) faceFile.addEventListener("change", function (event) {
        const file = event.target.files && event.target.files[0];
        keepShot(file, function (url) { setShot("portrait", url); });
      });
    }
    function paintLists() {
      const current = view();
      const views = host.querySelector("#map-view");
      views.innerHTML = page.views.map(function (item) {
        return '<option value="' + esc(item.id) + '">' + esc(item.name || "Вид") + "</option>";
      }).join("");
      views.value = current.id;
      const fonts = ctx.fonts();
      host.querySelector("#map-font").innerHTML = fonts.map(function (item) {
        return '<option value="' + esc(item.font) + '">' + esc(item.name) + "</option>";
      }).join("");
      paintTools();
      paintTree();
    }
    function paintSelected() {}
    function markerPersonId(marker) {
      if (!marker) return "";
      if (marker.npcId) return marker.npcId;
      if (marker.codexId) return marker.codexId;
      if (marker.actorId && ctx.campaign.battle) {
        const actor = (ctx.campaign.battle.actors || []).find(function (row) { return row && row.id === marker.actorId; });
        if (actor && actor.codexId) return actor.codexId;
      }
      return "";
    }
    function keepEnemy(marker) {
      if (!marker || (marker.kind !== "foe" && marker.kind !== "npc")) return;
      const id = markerPersonId(marker);
      const known = id && (book().npcs || []).find(function (row) { return row && row.id === id; });
      if (known) return;
      if (marker.kind !== "foe") return;
      const nid = id || crypto.randomUUID();
      book().npcs.push({
        id: nid,
        role: "enemy",
        name: marker.name || "Враг",
        note: "",
        weapon: marker.weapon || "",
        damage: marker.damage || "",
        hp: Number(marker.hp) || 0,
        hpMax: Number(marker.hpMax) || Number(marker.hp) || 0,
        portrait: marker.portrait || ""
      });
      marker.codexId = nid;
    }
    function releaseMarker(marker) {
      if (!marker) return;
      keepEnemy(marker);
      const personId = markerPersonId(marker);
      const battle = ctx.campaign.battle;
      if (battle) {
        (battle.actors || []).forEach(function (actor) {
          if (actor && actor.markerId === marker.id) actor.markerId = "";
        });
      }
      if (!personId) return;
      const loc = marker.locId ? findLoc(marker.locId) : null;
      const placeId = loc && loc.placeId;
      if (!placeId) return;
      const still = (view().markers || []).some(function (row) {
        return row && row.id !== marker.id && markerPersonId(row) === personId && (function () {
          const home = row.locId ? findLoc(row.locId) : null;
          return home && home.placeId === placeId;
        })();
      });
      if (still) return;
      const place = (book().places || []).find(function (row) { return row && row.id === placeId; });
      if (place && place.people) place.people = place.people.filter(function (id) { return id !== personId; });
    }
    function liftSquad(personId) {
      if (!personId) return;
      const squad = (book().squads || []).find(function (row) {
        return row && (row.memberIds || []).indexOf(personId) >= 0;
      });
      const ids = {};
      if (squad) (squad.memberIds || []).forEach(function (id) { if (id) ids[id] = true; });
      else ids[personId] = true;
      (ctx.campaign.pages || []).forEach(function (page) {
        (page.views || []).forEach(function (one) {
          (one.markers || []).forEach(function (marker) {
            if (marker && ids[markerPersonId(marker)]) keepEnemy(marker);
          });
          one.markers = (one.markers || []).filter(function (marker) {
            return !(marker && ids[markerPersonId(marker)]);
          });
        });
      });
      const battle = ctx.campaign.battle;
      if (battle) {
        (battle.actors || []).forEach(function (actor) {
          if (actor && actor.codexId && ids[actor.codexId]) actor.markerId = "";
        });
      }
      if (squad) {
        const place = squad.placeId && (book().places || []).find(function (row) { return row && row.id === squad.placeId; });
        if (place && place.people) {
          place.people = place.people.filter(function (id) { return !ids[id]; });
        }
        squad.placeId = "";
      }
    }
    function removeItem() {
      const item = findItem();
      if (!item) return;
      const current = view();
      if (selected.kind === "loc") {
        dropLocation(item.id);
        return;
      } else if (selected.kind === "label") {
        current.labels = current.labels.filter(function (label) { return label.id !== item.id; });
      } else {
        releaseMarker(item);
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
      if (selected.kind === "loc") {
        copy.trashed = false;
        current.locations.push(copy);
        if (!copy.placeId) ensurePlace(copy);
      }
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
      campaign.codex.heroes = campaign.codex.heroes || [];
      return campaign.codex;
    }
    function ensurePlace(loc) {
      if (!loc || loc.trashed) return false;
      const places = book().places;
      if (loc.placeId && places.some(function (row) { return row.id === loc.placeId; })) return false;
      const id = loc.placeId || crypto.randomUUID();
      places.push({
        id: id,
        name: loc.name || "Локация",
        people: [],
        portrait: loc.portrait || "",
        backdrop: loc.night || loc.day || ""
      });
      loc.placeId = id;
      return true;
    }
    function ensureNpc(marker) {
      if (!marker || marker.kind !== "npc") return false;
      const npcs = book().npcs;
      if (marker.npcId && npcs.some(function (row) { return row.id === marker.npcId; })) return false;
      const id = marker.npcId || crypto.randomUUID();
      npcs.push({
        id: id,
        role: "npc",
        name: marker.name || "НПС",
        note: "",
        weapon: "",
        damage: "",
        hp: 0,
        hpMax: 0,
        goods: [],
        lines: [],
        portrait: marker.portrait || ""
      });
      marker.npcId = id;
      return true;
    }
    function forgetPlace(loc) {
      if (!loc || !loc.placeId) return;
      let used = false;
      (ctx.campaign.pages || []).forEach(function (page) {
        (page.views || []).forEach(function (one) {
          (one.locations || []).forEach(function (item) {
            if (item && item.id !== loc.id && !item.trashed && item.placeId === loc.placeId) used = true;
          });
        });
      });
      if (used) return;
      const places = book().places;
      const row = places.find(function (item) { return item.id === loc.placeId; });
      if (row && row.people && row.people.length) return;
      book().places = places.filter(function (item) { return item.id !== loc.placeId; });
    }
    function syncPlaces() {
      if (window.ShirmoCodex && window.ShirmoCodex.adopt(ctx.campaign)) ctx.save();
    }
    function dialogueMood(who, row) {
      if (!who || !window.ShirmoNpc) return;
      window.ShirmoNpc.apply(who);
      if (who.moodHold) return;
      const next = row && row.phase !== "" && row.phase != null ? (Number(row.phase) || 0) : 0;
      who.mood = next;
      window.ShirmoNpc.apply(who);
    }
    const shopFold = {};
    function talkView(marker) {
      const npc = linkedNpc(marker);
      const who = npc || marker;
      const lines = window.ShirmoNpc.replicas(who);
      const index = lines.length ? Math.min(lines.length - 1, Math.max(0, Number(marker.talkLine) || 0)) : -1;
      const chosen = index >= 0 ? lines[index] : null;
      dialogueMood(who, chosen);
      const fallback = !lines.length ? String((npc && npc.note) || (marker && marker.tip) || "").trim() : "";
      const shot = levelImage(view(), book().places);
      const shop = !!marker.shopOpen;
      const goods = shop ? saleGoods(npc || marker).map(function (item) {
        return Object.assign({}, item, {
          priceText: window.ShirmoCoins.text(item, ctx.campaign),
          open: !!shopFold[item.id]
        });
      }) : null;
      return {
        name: marker.name || (npc && npc.name) || "НПС",
        line: chosen ? (chosen.text || "...") : (fallback || "..."),
        index: index,
        reps: lines.map(function (row) {
          return { label: window.ShirmoNpc.label(row), text: row.text || "", ink: row.ink || "", font: row.font || "", plate: row.plate || "" };
        }),
        phases: (who.moods || []).map(function (mood, index) {
          return { emoji: mood.emoji || "", on: index === (Number(who.mood) || 0) };
        }),
        emoji: who.emoji || "",
        hold: !!who.moodHold,
        portrait: npc && npc.portrait ? npc.portrait : "",
        figure: figureOf(npc || marker, shop),
        campaign: ctx.campaign,
        shop: shop,
        goods: goods,
        fontSize: window.ShirmoShopFont ? window.ShirmoShopFont.read(ctx.campaign) : 16,
        backdrop: (npc && npc.backdrop) || shot.image || ""
      };
    }
    function openTalk(id) {
      const marker = (view().markers || []).find(function (item) { return item.id === id && item.kind === "npc"; });
      if (!marker) return;
      view().talkId = id;
      skipClick = Date.now() + 400;
      closeMenu();
      paintBoard();
      ctx.save();
    }
    function leaveTalk() {
      closeTalkPop();
      if (ctx.hideGoods) ctx.hideGoods();
      const marker = (view().markers || []).find(function (item) { return item.id === view().talkId; });
      if (marker) marker.shopOpen = false;
      view().talkId = "";
      paintBoard();
      ctx.save();
    }
    function bindTalk(marker) {
      const stage = board.querySelector(".talk-stage");
      const back = board.querySelector("[data-talk=back]");
      const figure = board.querySelector(".talk-figure");
      const record = linkedNpc(marker) || marker;
      let suppress = false;
      if (stage) stage.addEventListener("click", function (event) {
        if (suppress) { suppress = false; return; }
        if (event.target.closest(".talk-box, .talk-figure, .talk-shop, .talk-top, .talk-mood-list")) return;
        leaveTalk();
      });
      if (back) back.addEventListener("click", function (event) {
        event.stopPropagation();
        leaveTalk();
      });
      const talkBtn = board.querySelector("[data-talk=talk]");
      const tradeBtn = board.querySelector("[data-talk=trade]");
      if (talkBtn) talkBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        if (!marker.shopOpen) return;
        marker.shopOpen = false;
        paintBoard();
        ctx.save();
      });
      if (tradeBtn) tradeBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        if (marker.shopOpen) return;
        marker.shopOpen = true;
        paintBoard();
        ctx.save();
      });
      const moodOpen = board.querySelector("[data-talk=mood]");
      const moodList = board.querySelector(".talk-mood-list");
      if (moodOpen && moodList) moodOpen.addEventListener("click", function (event) {
        event.stopPropagation();
        moodList.hidden = !moodList.hidden;
      });
      board.querySelectorAll("[data-talk=line]").forEach(function (button) {
        button.addEventListener("click", function () {
          marker.talkLine = Number(button.getAttribute("data-i")) || 0;
          paintBoard();
          ctx.save();
        });
      });
      const autoBtn = board.querySelector("[data-talk=mood-auto]");
      if (autoBtn) autoBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        const who = linkedNpc(marker) || marker;
        who.moodHold = false;
        paintBoard();
        ctx.save();
      });
      board.querySelectorAll("[data-talk=phase]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          const who = linkedNpc(marker) || marker;
          who.moodHold = true;
          who.mood = Number(button.getAttribute("data-i")) || 0;
          window.ShirmoNpc.apply(who);
          paintBoard();
          ctx.save();
        });
      });
      const wareBtn = board.querySelector("[data-talk=ware]");
      if (wareBtn) wareBtn.addEventListener("click", function () { openWare(linkedNpc(marker) || marker); });
      const linesBtn = board.querySelector("[data-talk=lines]");
      if (linesBtn) linesBtn.addEventListener("click", function () { openLines(linkedNpc(marker) || marker); });
      if (window.ShirmoShopFont) {
        let fontWait = 0;
        window.ShirmoShopFont.bind(board, function (size) {
          window.ShirmoShopFont.write(size, ctx.campaign);
          dirty();
          clearTimeout(fontWait);
          fontWait = setTimeout(function () {
            if (ctx.shopFont) ctx.shopFont(size);
          }, 120);
        });
      }
      const showGoods = board.querySelector("[data-talk=show-goods]");
      if (showGoods) showGoods.addEventListener("click", function (event) {
        event.stopPropagation();
        const rows = saleGoods(linkedNpc(marker) || marker).filter(function (item) { return !item.hidden && !item.off; }).map(function (item) {
          const ink = window.ShirmoItems ? window.ShirmoItems.inkOf(item) : (item.ink || "");
          return {
            name: item.name,
            price: window.ShirmoCoins.text(item, ctx.campaign),
            icon: item.icon || "",
            note: item.note || "",
            ink: ink,
            rarity: item.rarity || ""
          };
        });
        if (ctx.showGoods) ctx.showGoods(rows);
      });
      function stockOf(node) {
        return findStock(linkedNpc(marker) || marker, node.getAttribute("data-id") || node.getAttribute("data-good"));
      }
      board.querySelectorAll("[data-shop]").forEach(function (input) {
        input.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
        input.addEventListener("click", function (event) { event.stopPropagation(); });
        input.addEventListener("input", function () {
          const item = stockOf(input);
          if (!item) return;
          const key = input.getAttribute("data-shop");
          if (key === "price" || key === "coin") window.ShirmoCoins.take(item, input);
          else if (key === "qty") {
            item.qty = input.value === "" ? "" : Math.max(0, Math.round(Number(input.value) || 0));
            const row = input.closest("li");
            if (row) row.classList.toggle("is-gone", stockHidden(item));
          } else item[key] = input.value;
          dirty();
        });
      });
      board.querySelectorAll("[data-shop-hide]").forEach(function (input) {
        input.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
        input.addEventListener("click", function (event) { event.stopPropagation(); });
        input.addEventListener("change", function () {
          const item = stockOf(input);
          if (!item) return;
          item.hideEmpty = input.checked;
          const row = input.closest("li");
          if (row) row.classList.toggle("is-gone", stockHidden(item));
          dirty();
        });
      });
      board.querySelectorAll("[data-shop-edit]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          const item = stockOf(button);
          if (item) editGood(item);
        });
      });
      board.querySelectorAll("[data-shop-fold]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          const id = button.getAttribute("data-id");
          if (!id) return;
          shopFold[id] = !shopFold[id];
          paintBoard();
        });
      });
      board.querySelectorAll("[data-shop-eye]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.stopPropagation();
          const item = stockOf(button);
          if (!item) return;
          item.off = !item.off;
          paintBoard();
          dirty();
        });
      });
      const shop = board.querySelector(".talk-shop");
      if (shop) shop.addEventListener("click", function (event) {
        if (event.target.closest("input, button, select, label, a")) return;
        const row = event.target.closest("li[data-good]");
        if (!row) return;
        const item = stockOf(row);
        if (item) openGoodCard(item);
      });
      if (!figure) return;
      function live(fig) {
        const next = putFigure(record, !!marker.shopOpen, fig) || figureOf(record, !!marker.shopOpen);
        figure.style.left = next.x + "%";
        figure.style.bottom = next.y + "%";
        figure.style.height = next.h + "%";
        dirty();
      }
      function track(node) {
        if (!node) return;
        node.addEventListener("pointerdown", function (event) {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          const rect = stage.getBoundingClientRect();
          const start = figureOf(record, !!marker.shopOpen);
          const pan = { x: event.clientX, y: event.clientY, moved: false };
          const oldPop = document.getElementById("talk-size-pop");
          if (oldPop) oldPop.remove();
          try { node.setPointerCapture(event.pointerId); } catch (error) { /* synthetic */ }
          function move(ev) {
            const dx = (ev.clientX - pan.x) / rect.width * 100;
            const dy = (ev.clientY - pan.y) / rect.height * 100;
            if (Math.abs(ev.clientX - pan.x) + Math.abs(ev.clientY - pan.y) > 3) pan.moved = true;
            live({ x: start.x + dx, y: start.y - dy, h: start.h });
          }
          function end() {
            node.removeEventListener("pointermove", move);
            node.removeEventListener("pointerup", end);
            node.removeEventListener("pointercancel", end);
            if (pan.moved) suppress = true;
            ctx.save();
          }
          node.addEventListener("pointermove", move);
          node.addEventListener("pointerup", end);
          node.addEventListener("pointercancel", end);
        });
      }
      track(figure);
      figure.addEventListener("contextmenu", function (event) {
        event.preventDefault();
        event.stopPropagation();
        const old = document.getElementById("talk-menu");
        if (old) old.remove();
        const menu = document.createElement("div");
        menu.id = "talk-menu";
        menu.className = "pin-menu talk-menu";
        const size = figureOf(record, !!marker.shopOpen).h;
        menu.innerHTML = '<button type="button" data-menu="lines" title="Редактор реплик">Реплики</button>' +
          '<button type="button" data-menu="ware" title="Товары персонажа">Товары</button>' +
          '<button type="button" data-menu="shop" title="Переключить разговор и торговлю">' + (marker.shopOpen ? "К разговору" : "Торговля") + "</button>" +
          '<label class="talk-size" title="Размер портрета на сцене">Размер<input id="talk-size" type="range" min="8" max="220" value="' + size + '" aria-label="Размер портрета"></label>';
        menu.style.left = Math.max(8, Math.min(event.clientX, window.innerWidth - 220)) + "px";
        menu.style.top = Math.max(8, Math.min(event.clientY, window.innerHeight - 240)) + "px";
        document.body.appendChild(menu);
        menu.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
        const sizeInput = menu.querySelector("#talk-size");
        if (sizeInput) {
          sizeInput.addEventListener("input", function (ev) {
            const cur = figureOf(record, !!marker.shopOpen);
            live({ x: cur.x, y: cur.y, h: Number(ev.target.value) });
          });
          sizeInput.addEventListener("change", function () { ctx.save(); });
        }
        menu.addEventListener("click", function (ev) {
          const act = ev.target.getAttribute("data-menu");
          if (!act) return;
          menu.remove();
          if (act === "lines") openLines(linkedNpc(marker) || marker);
          else if (act === "ware") openWare(linkedNpc(marker) || marker);
          else if (act === "shop") {
            marker.shopOpen = !marker.shopOpen;
            paintBoard();
            ctx.save();
          }
        });
      });
    }
    function plainGood(value) {
      return String(value || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/\s+\n/g, "\n").trim();
    }
    function catalogGood(icon) {
      if (!icon || !window.allItems) return null;
      const file = decodeURIComponent(String(icon).split("?")[0].split("/").pop() || "");
      if (!file) return null;
      return window.allItems.find(function (row) { return row.en && row.en.img === file; }) || null;
    }
    function editGood(item, onChange) {
      if (!item) return;
      const old = document.getElementById("good-edit");
      if (old) old.remove();
      const edit = document.createElement("div");
      edit.id = "good-edit";
      edit.className = "pop";
      edit._item = item;
      if (window.ShirmoItems) window.ShirmoItems.applyRarity(item);
      function face() {
        return item.icon ? '<img alt="" src="' + esc(item.icon) + '">' : "";
      }
      function tintRows() {
        const tint = window.ShirmoItems ? window.ShirmoItems.inkOf(item) : (item.ink || "");
        document.querySelectorAll('.shop-item[data-good="' + item.id + '"], .ware-item[data-id="' + item.id + '"]').forEach(function (row) {
          row.style.color = tint || "";
        });
      }
      function libraryOptions() {
        return ((ctx.library().images) || []).map(function (image) {
          const section = window.ShirmoLib ? window.ShirmoLib.title(image, book().npcs) : "";
          const label = section && section !== "Общее" ? section + " — " + (image.name || "Картинка") : (image.name || "Картинка");
          return '<option value="' + esc(image.url) + '">' + esc(label) + "</option>";
        }).join("");
      }
      function raritySelect() {
        if (!window.ShirmoItems) return "";
        return '<label class="ware-ink" title="Редкость задаёт цвет строки">Редкость<select data-edit-rarity aria-label="Редкость">' +
          window.ShirmoItems.rarityOptions(item.rarity) + "</select></label>";
      }
      edit.innerHTML = '<div class="pop-card ware-edit-card" role="dialog" aria-label="Иконка и редкость"><div class="pop-head"><h2>Иконка и редкость</h2><button type="button" data-pop-close title="Закрыть">×</button></div>' +
        '<div class="ware-edit"><div class="ware-edit-face">' + face() + "</div>" +
        raritySelect() +
        '<label class="file-btn" title="Своя иконка. Попадёт в библиотеку, в раздел «Иконки товаров»">' + window.ShirmoGlyph.upload + '<input type="file" accept="image/*" data-edit-file aria-label="Загрузить иконку"></label>' +
        '<select data-edit-lib data-shelf="image" title="Иконка из библиотеки" aria-label="Иконка из библиотеки"><option value="">Библиотека</option>' + libraryOptions() + "</select>" +
        '<div class="ware-find"><input data-edit-find type="text" placeholder="Поиск" aria-label="Поиск предмета для иконки" title="Иконка из общего списка предметов"><div class="ware-hits" hidden></div></div>' +
        "</div></div>";
      document.body.appendChild(edit);
      function shut() { if (edit.parentNode) edit.remove(); }
      edit.addEventListener("click", function (event) { if (event.target === edit) shut(); });
      edit.querySelector("[data-pop-close]").addEventListener("click", shut);
      function shown() {
        const slot = edit.querySelector(".ware-edit-face");
        if (slot && edit.isConnected) slot.innerHTML = face();
        tintRows();
        if (onChange) onChange();
        else {
          paintBoard();
          dirty();
        }
      }
      const rarityField = edit.querySelector("[data-edit-rarity]");
      if (rarityField) {
        rarityField.addEventListener("change", function () {
          item.rarity = rarityField.value || "";
          if (window.ShirmoItems) {
            if (item.rarity) window.ShirmoItems.applyRarity(item);
            else item.ink = "";
          }
          tintRows();
          if (onChange) onChange();
          else dirty();
        });
      }
      edit.querySelector("[data-edit-lib]").addEventListener("change", function (event) {
        if (!event.target.value) return;
        item.icon = event.target.value;
        shown();
      });
      edit.querySelector("[data-edit-file]").addEventListener("change", function (event) {
        const file = event.target.files && event.target.files[0];
        if (!file || !ctx.upload) return;
        ctx.upload(file).then(function (url) {
          item.icon = url;
          if (!ctx.campaign.library) ctx.campaign.library = { fonts: [], images: [], notes: [] };
          if (window.ShirmoLib) window.ShirmoLib.keep(ctx.campaign.library, {
            url: url,
            name: item.name || file.name.replace(/\.[^.]+$/, ""),
            section: "icons",
            sectionName: "Иконки товаров"
          });
          shown();
        });
      });
      const find = edit.querySelector("[data-edit-find]");
      find.addEventListener("input", function () {
        const box = find.parentNode.querySelector(".ware-hits");
        const q = find.value.trim().toLowerCase();
        if (q.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
        window.ShirmoItems.ready().then(function () {
          if (!edit.isConnected) return;
          const hits = window.ShirmoItems.find(q).slice(0, 8);
          box.hidden = !hits.length;
          box.innerHTML = hits.map(function (row, index) {
            const icon = window.ShirmoItems.icon(row);
            return '<button type="button" data-hit="' + index + '">' + (icon ? '<img alt="" src="' + esc(icon) + '">' : "") + esc(window.ShirmoItems.title(row)) + "</button>";
          }).join("");
          box.querySelectorAll("[data-hit]").forEach(function (button) {
            button.addEventListener("click", function () {
              const row = hits[Number(button.getAttribute("data-hit"))];
              if (!row) return;
              const icon = window.ShirmoItems.icon(row);
              if (icon) item.icon = icon;
              if (!String(item.name || "").trim()) item.name = window.ShirmoItems.title(row);
              if (!String(item.price || "").trim() && !item.coin) window.ShirmoCoins.adopt(item, window.ShirmoItems.price(row), ctx.campaign);
              item.rarity = window.ShirmoItems.rarityOf(row) || item.rarity || "";
              window.ShirmoItems.applyRarity(item);
              if (rarityField) rarityField.value = item.rarity || "";
              find.value = "";
              box.hidden = true;
              box.innerHTML = "";
              shown();
            });
          });
        });
      });
    }
    function openGoodCard(item) {
      const note = String(item.note || "").trim();
      if (!item.icon && !note) return;
      const old = document.getElementById("good-card");
      if (old) old.remove();
      const pop = document.createElement("div");
      pop.id = "good-card";
      pop.className = "pop";
      const image = item.icon ? '<img class="good-zoom" alt="" src="' + esc(item.icon) + '">' : "";
      pop.innerHTML = '<div class="pop-card good-card" role="dialog" aria-label="Товар"><div class="pop-head"><h2>' + esc(item.name || "Предмет") + '</h2><button type="button" data-pop-close title="Закрыть">×</button></div>' +
        image +
        (window.ShirmoCoins.text(item, ctx.campaign) ? '<p class="good-price">' + esc(window.ShirmoCoins.text(item, ctx.campaign)) + "</p>" : "") +
        '<p class="good-note">' + esc(note) + "</p></div>";
      document.body.appendChild(pop);
      function close() { if (pop.parentNode) pop.remove(); }
      pop.addEventListener("click", function (event) { if (event.target === pop) close(); });
      pop.querySelector("[data-pop-close]").addEventListener("click", close);
      if (note || !window.ShirmoItems) return;
      window.ShirmoItems.ready().then(function () {
        if (!pop.parentNode) return;
        const row = catalogGood(item.icon);
        const text = row && row.ru ? plainGood(row.ru.text) : "";
        const slot = pop.querySelector(".good-note");
        if (slot && text) slot.textContent = text;
      });
    }
    function closeTalkPop() {
      const edit = document.getElementById("good-edit");
      if (edit) edit.remove();
      const old = document.getElementById("talk-pop");
      const wasWare = !!(old && old.querySelector("[data-show-goods]"));
      if (old) old.remove();
      if (wasWare && ctx.hideGoods) ctx.hideGoods();
    }
    function openLines(npc) {
      closeTalkPop();
      if (!npc || !window.ShirmoNpc) return;
      const pop = document.createElement("div");
      pop.id = "talk-pop";
      pop.className = "pop";
      const fonts = ctx.fonts ? ctx.fonts() : [];
      const images = (ctx.library().images) || [];
      pop.innerHTML = '<div class="pop-card talk-pop" role="dialog" aria-label="Реплики"><div class="pop-head"><h2>Реплики</h2><button type="button" data-pop-close title="Закрыть">×</button></div>' +
        window.ShirmoNpc.html(npc, images, null, { fonts: fonts, linesOnly: true }) + "</div>";
      document.body.appendChild(pop);
      pop.addEventListener("click", function (event) { if (event.target === pop) closeTalkPop(); });
      pop.querySelector("[data-pop-close]").addEventListener("click", closeTalkPop);
      const sheet = pop.querySelector("[data-npc-sheet]");
      window.ShirmoNpc.bind(sheet, npc, {
        images: function () { return (ctx.library().images) || []; },
        fonts: function () { return ctx.fonts ? ctx.fonts() : []; },
        upload: ctx.upload,
        change: function () {
          paintBoard();
          dirty();
        }
      });
    }
    function openWare(npc) {
      closeTalkPop();
      if (!npc) return;
      const became = npc.role !== "merchant";
      if (npc.role !== "merchant") npc.role = "merchant";
      if (!Array.isArray(npc.goods)) npc.goods = [];
      if (!book().wares) book().wares = [];
      const pop = document.createElement("div");
      pop.id = "talk-pop";
      pop.className = "pop";
      pop._open = {};
      document.body.appendChild(pop);
      function sheetsOf() {
        return (book().wares || []).filter(function (sheet) {
          return sheet && (sheet.npcId === npc.id || sheet.id === npc.wareId);
        });
      }
      function ensureSheet(id) {
        if (id === "__new") {
          const sheet = { id: crypto.randomUUID(), name: npc.name || "Лист", npcId: npc.id, items: [] };
          book().wares.push(sheet);
          if (!npc.wareId) npc.wareId = sheet.id;
          return sheet;
        }
        const sheet = (book().wares || []).find(function (row) { return row && row.id === id; });
        if (!sheet) return null;
        sheet.npcId = npc.id;
        if (!Array.isArray(sheet.items)) sheet.items = [];
        if (!npc.wareId) npc.wareId = sheet.id;
        return sheet;
      }
      function bag(home) {
        if (!home) return npc.goods;
        const sheet = ensureSheet(home);
        return sheet ? sheet.items : npc.goods;
      }
      function entries() {
        const rows = npc.goods.map(function (item, index) { return { item: item, home: "", index: index }; });
        sheetsOf().forEach(function (sheet) {
          (sheet.items || []).forEach(function (item, index) {
            rows.push({ item: item, home: sheet.id, index: index });
          });
        });
        return rows;
      }
      function blank() {
        return { id: crypto.randomUUID(), name: "", price: "", note: "", icon: "", qty: "", hideEmpty: false, ink: "", rarity: "" };
      }
      function putNew(home) {
        const item = blank();
        if (!home) npc.goods.push(item);
        else {
          const sheet = ensureSheet(home);
          (sheet ? sheet.items : npc.goods).push(item);
        }
      }
      function sheetOptions(home) {
        return '<option value=""' + (home ? "" : " selected") + ">Свои</option>" + sheetsOf().map(function (sheet) {
          return '<option value="' + esc(sheet.id) + '"' + (sheet.id === home ? " selected" : "") + ">" + esc(sheet.name || "Лист") + "</option>";
        }).join("") + '<option value="__new">Новый лист</option>';
      }
      function itemOf(node) {
        return bag(node.getAttribute("data-home"))[Number(node.getAttribute("data-i"))];
      }
      function openGoodEdit(item) {
        editGood(item, function () {
          paint();
          paintBoard();
          dirty();
        });
      }
      function paint() {
        const edit = document.getElementById("good-edit");
        if (edit && edit._item && !entries().some(function (row) { return row.item === edit._item; })) edit.remove();
        const rows = entries().map(function (entry) {
          const item = entry.item;
          if (!item.id) item.id = crypto.randomUUID();
          const mark = ' data-home="' + esc(entry.home) + '" data-i="' + entry.index + '"';
          const face = item.icon ? '<img alt="" src="' + esc(item.icon) + '">' : (window.ShirmoGlyph ? window.ShirmoGlyph.bag : "");
          const open = !!pop._open[item.id];
          const eye = item.off ? window.ShirmoGlyph.hide : window.ShirmoGlyph.eye;
          const eyeTitle = item.off ? "Показать товар игрокам" : "Скрыть товар от игроков";
          const tint = window.ShirmoItems ? window.ShirmoItems.inkOf(item) : (item.ink || "");
          return '<article class="ware-item' + (item.off ? " is-off" : "") + '" data-id="' + esc(item.id) + '"' + (tint ? ' style="color:' + esc(tint) + '"' : "") + ">" +
            '<div class="ware-head"><button type="button" class="ware-face" data-good-edit' + mark + ' title="Иконка и редкость" aria-label="Иконка и редкость">' + face + "</button>" +
            '<div class="ware-title">' +
            '<input data-good="name"' + mark + ' type="text" value="' + esc(item.name || "") + '" placeholder="Название" aria-label="Название товара">' +
            '<input data-good="note"' + mark + ' type="text" value="' + esc(item.note || "") + '" placeholder="Заметка" aria-label="Заметка">' +
            "</div>" +
            '<div class="ware-acts">' +
            '<button type="button" class="icon-btn" data-good-edit' + mark + ' title="Редактировать товар" aria-label="Редактировать товар">' + window.ShirmoGlyph.pencil + "</button>" +
            '<button type="button" class="icon-btn ware-fold" data-good-fold' + mark + ' aria-expanded="' + (open ? "true" : "false") + '" title="Параметры товара" aria-label="Параметры товара">' + window.ShirmoGlyph.fold + "</button>" +
            '<button type="button" class="icon-btn' + (item.off ? " is-off" : "") + '" data-good-eye' + mark + ' title="' + eyeTitle + '" aria-label="' + eyeTitle + '">' + eye + "</button>" +
            "</div></div>" +
            '<div class="ware-more"' + (open ? "" : " hidden") + ">" +
            window.ShirmoCoins.fields(item, ctx.campaign, 'data-good="price"' + mark, 'data-good="coin"' + mark) +
            '<input data-good="qty"' + mark + ' class="num" type="number" min="0" value="' + (item.qty == null || item.qty === "" ? "" : esc(String(item.qty))) + '" placeholder="∞" title="Количество. Пустое поле — без ограничения" aria-label="Количество">' +
            '<select data-good-sheet' + mark + ' title="Лист товаров этого персонажа" aria-label="Лист товаров">' + sheetOptions(entry.home) + "</select>" +
            '<label class="check icon-btn" title="Скрывать у игроков, когда количество станет нулём">' + window.ShirmoGlyph.hide + '<input data-good-hide' + mark + ' type="checkbox"' + (item.hideEmpty ? " checked" : "") + ' aria-label="Скрывать при нуле"></label>' +
            '<button type="button" data-good-del' + mark + ' title="Убрать товар" aria-label="Убрать">×</button>' +
            "</div></article>";
        }).join("");
        pop.innerHTML = '<div class="pop-card talk-pop" role="dialog" aria-label="Товары"><div class="pop-head"><h2>Товары</h2><span class="pop-acts"><button type="button" class="icon-btn" data-show-goods title="Показать игрокам" aria-label="Показать игрокам">' + window.ShirmoGlyph.cast + '</button><button type="button" data-pop-close title="Закрыть">×</button></span></div>' +
          (became ? '<p class="note">Персонаж стал торговцем.</p>' : "") +
          '<p class="note">Новый лист попадает во вкладку «Товары». Пустое количество — без ограничения.</p>' +
          rows +
          '<div class="codex-row"><button type="button" data-good-add title="Пустая строка товара">Добавить товар</button>' +
          '<select data-add-sheet aria-label="Куда добавить товар" title="Лист, в который попадёт новый товар">' + sheetOptions("") + "</select></div></div>";
        pop.querySelector("[data-pop-close]").addEventListener("click", closeTalkPop);
        pop.querySelector("[data-show-goods]").addEventListener("click", function () {
          const rows = entries().map(function (entry) { return entry.item; }).filter(function (item) {
            return item && String(item.name || "").trim() && !item.off && !stockHidden(item);
          }).map(function (item) {
            return { name: item.name, price: window.ShirmoCoins.text(item, ctx.campaign), icon: item.icon || "", note: item.note || "" };
          });
          if (ctx.showGoods) ctx.showGoods(rows);
        });
        pop.querySelector("[data-good-add]").addEventListener("click", function () {
          const pick = pop.querySelector("[data-add-sheet]");
          putNew(pick ? pick.value : "");
          paint();
          paintBoard();
          dirty();
        });
        pop.querySelectorAll("[data-good-del]").forEach(function (button) {
          button.addEventListener("click", function () {
            bag(button.getAttribute("data-home")).splice(Number(button.getAttribute("data-i")), 1);
            paint();
            paintBoard();
            dirty();
          });
        });
        pop.querySelectorAll("[data-good-edit]").forEach(function (button) {
          button.addEventListener("click", function () {
            const item = itemOf(button);
            if (item) openGoodEdit(item);
          });
        });
        pop.querySelectorAll("[data-good-fold]").forEach(function (button) {
          button.addEventListener("click", function () {
            const item = itemOf(button);
            if (!item) return;
            pop._open[item.id] = !pop._open[item.id];
            paint();
          });
        });
        pop.querySelectorAll("[data-good-eye]").forEach(function (button) {
          button.addEventListener("click", function () {
            const item = itemOf(button);
            if (!item) return;
            item.off = !item.off;
            paint();
            paintBoard();
            dirty();
          });
        });
        pop.querySelectorAll("[data-good]").forEach(function (input) {
          input.addEventListener("input", function () {
            const item = itemOf(input);
            if (!item) return;
            const key = input.getAttribute("data-good");
            if (key === "price" || key === "coin") window.ShirmoCoins.take(item, input);
            else item[key] = key === "qty" ? (input.value === "" ? "" : Math.max(0, Math.round(Number(input.value) || 0))) : input.value;
            dirty();
          });
        });
        pop.querySelectorAll("[data-good-hide]").forEach(function (input) {
          input.addEventListener("change", function () {
            const item = bag(input.getAttribute("data-home"))[Number(input.getAttribute("data-i"))];
            if (!item) return;
            item.hideEmpty = input.checked;
            dirty();
          });
        });
        pop.querySelectorAll("[data-good-sheet]").forEach(function (select) {
          select.addEventListener("change", function () {
            const list = bag(select.getAttribute("data-home"));
            const item = list[Number(select.getAttribute("data-i"))];
            if (!item) return;
            const at = list.indexOf(item);
            if (at >= 0) list.splice(at, 1);
            const next = select.value;
            if (!next) npc.goods.push(item);
            else {
              const sheet = ensureSheet(next);
              (sheet ? sheet.items : npc.goods).push(item);
            }
            paint();
            paintBoard();
            dirty();
          });
        });
      }
      pop.addEventListener("click", function (event) { if (event.target === pop) closeTalkPop(); });
      paint();
      dirty();
    }
    function linkedNpc(item) {
      const row = item || findItem();
      if (!row || row.kind !== "npc" || !row.npcId) return null;
      return book().npcs.find(function (npc) { return npc.id === row.npcId; }) || null;
    }
    function stockQty(item) {
      if (!item || item.qty == null || item.qty === "") return null;
      const n = Number(item.qty);
      if (!Number.isFinite(n)) return null;
      return Math.max(0, Math.round(n));
    }
    function stockHidden(item) {
      return !!(item && item.hideEmpty && stockQty(item) === 0);
    }
    function stockList(npc) {
      if (!npc) return [];
      const own = Array.isArray(npc.goods) ? npc.goods : [];
      const listed = (book().wares || []).filter(function (sheet) {
        return sheet && (sheet.npcId === npc.id || sheet.id === npc.wareId);
      }).reduce(function (all, sheet) {
        return all.concat(Array.isArray(sheet.items) ? sheet.items : []);
      }, []);
      return own.concat(listed).filter(function (item) { return item && String(item.name || "").trim(); });
    }
    function findStock(npc, id) {
      return stockList(npc).find(function (item) { return item.id === id; }) || null;
    }
    function saleGoods(npc) {
      return stockList(npc).map(function (item) {
        if (!item.id) item.id = crypto.randomUUID();
        return {
          id: item.id,
          name: item.name,
          price: item.price || "",
          coin: item.coin || "",
          icon: item.icon || "",
          note: item.note || "",
          ink: item.ink || "",
          qty: stockQty(item),
          hideEmpty: !!item.hideEmpty,
          off: !!item.off,
          hidden: stockHidden(item)
        };
      });
    }
    function faceOf(item) {
      if (item && item.kind === "hero") {
        const hero = (book().heroes || []).find(function (row) { return row && row.id === item.heroId; });
        const portrait = (hero && hero.portrait) || item.portrait || "";
        if (!portrait) return null;
        const frame = hero && hero.portrait ? hero : item;
        return Object.assign({ url: portrait, emoji: "" }, focusNums(frame));
      }
      const npc = linkedNpc(item);
      if (!npc) return null;
      const mood = window.ShirmoNpc.apply(npc);
      if (!mood.portrait) return null;
      return Object.assign({
        url: mood.portrait,
        emoji: mood.emoji || "",
        look: npc.look === "token" ? "token" : "full",
        stand: mapFigureOf(npc)
      }, focusNums(npc));
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
      const talkMenu = document.getElementById("talk-menu");
      if (talkMenu) talkMenu.remove();
      const sizePop = document.getElementById("talk-size-pop");
      if (sizePop) sizePop.remove();
    }
    function beginRename() {
      const item = findItem();
      if (!item || !selected) return;
      closeMenu();
      const pin = board.querySelector('[data-pin="' + selected.id + '"]');
      if (!pin) return;
      const multi = selected.kind === "label" || selected.kind === "loc" || selected.kind === "mark";
      const label = pin.querySelector("b") || pin;
      const rect = label.getBoundingClientRect();
      const look = getComputedStyle(label);
      const input = document.createElement(multi ? "textarea" : "input");
      input.id = "pin-rename";
      input.className = "pin-rename";
      input.value = item.name || item.text || "";
      input.style.left = rect.left + "px";
      input.style.top = rect.top + "px";
      input.style.width = Math.max(rect.width + 24, 140) + "px";
      input.style.fontSize = look.fontSize;
      input.style.fontFamily = look.fontFamily;
      if (multi) {
        input.rows = Math.min(6, Math.max(2, (input.value.match(/\n/g) || []).length + 1));
        input.title = "Enter — новая строка. Ctrl+Enter — готово";
      }
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
        if (event.key === "Enter" && (!multi || event.ctrlKey)) { event.preventDefault(); finish(true); }
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
          return '<button type="button" data-id="' + esc(row.id) + '" title="Назначить эту запись точке">' + esc(row.name || "Без имени") + "</button>";
        }).join("") || '<p class="roll-empty">В справочнике пусто</p>') +
        '<input id="codex-new" type="text" placeholder="Новая запись" title="Имя новой записи в справочнике">' +
        '<button type="button" data-act="add" title="Создать запись и назначить её точке">Добавить и назначить</button>';
      menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 240)) + "px";
      menu.style.top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 280)) + "px";
      document.body.appendChild(menu);
      menu.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
      function npcStillUsed(id, exceptMarkerId) {
        if (!id) return false;
        let used = false;
        (ctx.campaign.pages || []).forEach(function (one) {
          (one.views || []).forEach(function (oneView) {
            (oneView.markers || []).forEach(function (marker) {
              if (!marker || marker.id === exceptMarkerId) return;
              if (marker.npcId === id || marker.codexId === id) used = true;
            });
          });
        });
        const actors = ctx.campaign.battle && ctx.campaign.battle.actors || [];
        actors.forEach(function (actor) {
          if (actor && actor.codexId === id) used = true;
        });
        return used;
      }
      function bareNpc(row) {
        if (!row) return false;
        if ((row.lines || []).some(function (line) { return line && String(line.text || line.name || "").trim(); })) return false;
        if ((row.goods || []).some(function (item) { return item && String(item.name || "").trim(); })) return false;
        const moods = row.moods || [];
        if (moods.length > 1) return false;
        if (moods.some(function (mood) { return mood && String(mood.emoji || "").trim(); })) return false;
        if (String(row.note || "").trim()) return false;
        if (String(row.weapon || "").trim()) return false;
        if (String(row.damage || "").trim()) return false;
        if (String(row.backdrop || "").trim()) return false;
        if (Number(row.hp) || Number(row.hpMax) || Number(row.ac)) return false;
        const scores = row.scores || {};
        if (Object.keys(scores).some(function (key) { return scores[key] != null && Number(scores[key]) !== 10; })) return false;
        return true;
      }
      function retargetNpc(oldId, keepId) {
        (ctx.campaign.pages || []).forEach(function (one) {
          (one.views || []).forEach(function (oneView) {
            (oneView.markers || []).forEach(function (marker) {
              if (!marker || marker.id === item.id) return;
              if (marker.npcId === oldId) marker.npcId = keepId;
              if (marker.codexId === oldId) marker.codexId = keepId;
            });
          });
        });
        const actors = ctx.campaign.battle && ctx.campaign.battle.actors || [];
        actors.forEach(function (actor) {
          if (actor && actor.codexId === oldId) actor.codexId = keepId;
        });
        (book().wares || []).forEach(function (sheet) {
          if (sheet && sheet.npcId === oldId) sheet.npcId = keepId;
        });
      }
      function dropUnusedNpc(oldId, keepId) {
        if (!oldId || oldId === keepId) return;
        const old = (book().npcs || []).find(function (row) { return row && row.id === oldId; });
        (book().places || []).forEach(function (place) {
          if (!place || !Array.isArray(place.people)) return;
          const at = place.people.indexOf(oldId);
          if (at < 0) return;
          place.people.splice(at, 1);
          if (keepId && place.people.indexOf(keepId) < 0) place.people.push(keepId);
        });
        (book().squads || []).forEach(function (squad) {
          if (!squad || !Array.isArray(squad.memberIds)) return;
          const at = squad.memberIds.indexOf(oldId);
          if (at < 0) return;
          squad.memberIds.splice(at, 1);
          if (keepId && squad.memberIds.indexOf(keepId) < 0) squad.memberIds.push(keepId);
        });
        if (bareNpc(old)) retargetNpc(oldId, keepId);
        else if (npcStillUsed(oldId, item.id)) return;
        book().npcs = (book().npcs || []).filter(function (row) { return row && row.id !== oldId; });
      }
      function take(entry) {
        item.name = entry.name || item.name;
        if (selected.kind === "loc") {
          const oldPlaceId = item.placeId || "";
          const home = roomForPlace(entry.id, item.id);
          item.name = entry.name || (home && home.name) || item.name;
          item.placeId = entry.id;
          if (entry.portrait) {
            item.portrait = entry.portrait;
            if (entry.portraitX != null) item.portraitX = entry.portraitX;
            if (entry.portraitY != null) item.portraitY = entry.portraitY;
            if (entry.portraitZoom != null) item.portraitZoom = entry.portraitZoom;
          }
          if (home && home.id !== item.id) {
            retargetInterior(item.id, home.id);
            item.linkId = home.id;
          } else {
            item.linkId = "";
            if (entry.backdrop) {
              if (!item.day) item.day = entry.backdrop;
              if (!item.night) item.night = entry.backdrop;
            }
          }
          if (oldPlaceId && oldPlaceId !== entry.id) {
            const places = book().places || [];
            const oldPlace = places.find(function (row) { return row && row.id === oldPlaceId; });
            const stillOnMap = (ctx.campaign.pages || []).some(function (one) {
              return (one.views || []).some(function (oneView) {
                return (oneView.locations || []).some(function (loc) {
                  return loc && loc.id !== item.id && loc.placeId === oldPlaceId && !loc.trashed;
                });
              });
            });
            if (oldPlace && !stillOnMap && !(oldPlace.people && oldPlace.people.length) && !oldPlace.portrait && !oldPlace.backdrop) {
              book().places = places.filter(function (row) { return !row || row.id !== oldPlaceId; });
            }
          }
        } else {
          const oldId = item.npcId || "";
          item.npcId = entry.id;
          dropUnusedNpc(oldId, entry.id);
        }
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
    function seatNpcAt(npcId, placeId) {
      if (!npcId || !placeId) return;
      const place = (book().places || []).find(function (row) { return row.id === placeId; });
      if (!place) return;
      place.people = place.people || [];
      if (place.people.indexOf(npcId) < 0) place.people.push(npcId);
    }
    function homeTreeHtml(blocked) {
      const locs = (view().locations || []).filter(function (item) { return item && !item.trashed; });
      function lines(parentId, depth) {
        return locs.filter(function (item) { return (item.parentId || "") === parentId; }).map(function (item) {
          const off = blocked[item.id];
          return '<button type="button" data-to="' + esc(item.id) + '"' + (off ? " disabled" : "") +
            ' style="padding-left:' + (8 + depth * 12) + 'px" title="' + (off ? "Сюда нельзя" : "Перенести сюда") + '">' +
            esc(item.name || "Локация") + "</button>" + lines(item.id, depth + 1);
        }).join("");
      }
      return '<button type="button" data-to="" title="На верхний уровень карты">Корень карты</button>' + lines("", 0);
    }
    function applyHome(targetId, kind, id) {
      const current = view();
      const to = targetId || "";
      if (kind === "loc") {
        const loc = findLoc(id);
        if (!loc || loc.trashed) return;
        const blocked = subtree(id);
        if (to && blocked[to]) return;
        if ((loc.parentId || "") === to) return;
        loc.parentId = to;
        leaveFocus(blocked, to);
        if (selected && selected.id === id) selected = null;
      } else {
        const list = kind === "label" ? current.labels : current.markers;
        const row = (list || []).find(function (item) { return item.id === id; });
        if (!row) return;
        if ((row.locId || "") === to) return;
        const prevLoc = row.locId ? findLoc(row.locId) : null;
        const prevPlace = prevLoc && prevLoc.placeId;
        row.locId = to;
        if ((row.kind === "npc" && row.npcId) || (row.kind === "foe" && (row.codexId || row.actorId))) {
          const hostLoc = to ? findLoc(to) : null;
          let personId = row.npcId || row.codexId || "";
          if (!personId && row.actorId && ctx.campaign.battle) {
            const actor = (ctx.campaign.battle.actors || []).find(function (one) { return one && one.id === row.actorId; });
            personId = actor && actor.codexId || "";
          }
          if (personId) {
            seatNpcAt(personId, hostLoc && hostLoc.placeId);
            if (prevPlace && prevPlace !== (hostLoc && hostLoc.placeId)) {
              const left = (current.markers || []).some(function (marker) {
                if (!marker || marker.id === row.id || markerPersonId(marker) !== personId) return false;
                const home = marker.locId ? findLoc(marker.locId) : null;
                return home && home.placeId === prevPlace;
              });
              if (!left) {
                const place = (book().places || []).find(function (entry) { return entry && entry.id === prevPlace; });
                if (place && place.people) place.people = place.people.filter(function (id) { return id !== personId; });
              }
            }
            dedupePersonMarkers(personId, row.id);
          }
        }
        if (selected && selected.id === id) selected = null;
      }
      current.focusId = to;
      closeMenu();
      paintBoard();
      paintTree();
      ctx.save();
    }
    function dedupePersonMarkers(personId, keepId) {
      if (!personId) return;
      const current = view();
      const hits = (current.markers || []).filter(function (marker) {
        if (!marker) return false;
        if (marker.npcId === personId || marker.codexId === personId) return true;
        if (marker.actorId && ctx.campaign.battle) {
          const actor = (ctx.campaign.battle.actors || []).find(function (one) { return one && one.id === marker.actorId; });
          if (actor && actor.codexId === personId) return true;
        }
        return false;
      });
      if (hits.length < 2) return;
      const keep = hits.find(function (marker) { return marker.id === keepId; }) || hits[0];
      const here = keep.locId || "";
      const drop = {};
      hits.forEach(function (marker) {
        if (marker.id !== keep.id && (marker.locId || "") === here) drop[marker.id] = true;
      });
      current.markers = current.markers.filter(function (marker) { return !drop[marker.id]; });
      const actors = ctx.campaign.battle && ctx.campaign.battle.actors || [];
      actors.forEach(function (actor) {
        if (actor && drop[actor.markerId]) actor.markerId = keep.id;
      });
    }
    function pickHome(kind, id, anchor) {
      closeMenu();
      const blocked = kind === "loc" ? subtree(id) : {};
      const menu = document.createElement("div");
      menu.id = "pin-menu";
      menu.className = "pin-menu pin-home";
      menu.innerHTML = '<p class="note">Перенести в</p>' + homeTreeHtml(blocked);
      const rect = (anchor || board).getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 240)) + "px";
      menu.style.top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 320)) + "px";
      document.body.appendChild(menu);
      menu.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
      menu.addEventListener("click", function (event) {
        const button = event.target.closest("[data-to]");
        if (!button || button.disabled) return;
        applyHome(button.getAttribute("data-to") || "", kind, id);
      });
    }
    function styleHtml(item, kind) {
      const currentFont = item.font || "Georgia, serif";
      const fonts = ctx.fonts();
      const known = fonts.some(function (font) { return font.font === currentFont; });
      const fontOptions = (known ? "" : '<option value="' + esc(currentFont) + '">Текущий</option>') + fonts.map(function (font) {
        return '<option value="' + esc(font.font) + '"' + (font.font === currentFont ? " selected" : "") + ">" + esc(font.name) + "</option>";
      }).join("");
      const npcRec = kind === "npc" ? (linkedNpc(item) || item) : null;
      const figureMode = !!(npcRec && (npcRec.portrait || item.portrait) && npcRec.look !== "token" && item.look !== "token");
      const pinDefault = figureMode
        ? mapFigureOf(npcRec).h
        : (Number(item.pinSize) || (kind === "image" ? 120 : (faceOf(item) ? 56 : 14)));
      const pinMax = figureMode ? 220 : (kind === "image" ? 400 : 140);
      const pinMin = figureMode ? 8 : (kind === "image" ? 32 : 12);
      const pin = kind === "label" ? "" : '<label title="' + (figureMode ? "Размер фигуры на карте, без диалога" : (kind === "image" ? "Размер картинки на карте" : "Размер точки на карте")) + '">Размер<input id="pin-size" type="range" min="' + pinMin + '" max="' + pinMax + '" value="' + pinDefault + '"></label>';
      const note = kind === "mark" || kind === "npc" || kind === "loc" || kind === "image" || kind === "hero"
        ? '<label title="' + (kind === "loc" ? "Заметка к локации. Игроки видят её при наведении, если точка им показана" : "Текст при наведении") + '">' + (kind === "loc" ? "Заметка" : "Подсказка") + '<textarea id="pin-tip">' + esc(item.tip || "") + "</textarea></label>" +
          '<label class="check" title="Игроки это не видят"><input id="pin-hide" type="checkbox"' + (item.hidden ? " checked" : "") + "> Скрыть от игроков</label>"
        : "";
      const imageShot = kind === "image"
        ? (item.url ? '<img class="loc-shot" alt="" src="' + esc(item.url) + '">' : '<p class="note">Картинки пока нет.</p>') +
          '<label class="file-btn" title="Загрузить другую картинку">Загрузить<input type="file" id="image-pin-file" accept="image/*" aria-label="Загрузить картинку"></label>' +
          '<label title="Картинка из библиотеки">Из библиотеки<select id="image-pin-lib" data-shelf="image"><option value="">Нет</option>' + ((ctx.library().images) || []).map(function (image) {
            return '<option value="' + esc(image.url) + '"' + (image.url === item.url ? " selected" : "") + ">" + esc(image.name || "Картинка") + "</option>";
          }).join("") + "</select></label>"
        : "";
      const npcFace = kind === "npc" ? linkedNpc(item) : null;
      if (npcFace) window.ShirmoNpc.apply(npcFace);
      const face = npcFace && npcFace.portrait ? Object.assign({ url: npcFace.portrait }, focusNums(npcFace)) : null;
      const frame = npcFace
        ? '<div class="face-pick" id="face-pick" title="Потяните круг, чтобы выбрать, какая часть портрета видна"' + (face ? "" : " hidden") + '><img alt="" src="' + esc(face ? face.url : "") + '" style="' + (face ? faceStyle(npcFace) : "") + '"></div>' +
          '<p class="note">Потяните круг, чтобы выбрать часть портрета.</p>' +
          '<label title="Крупнее показывает выбранную часть портрета в рамке">Крупность<input id="face-zoom" type="range" min="100" max="300" value="' + Math.round((face ? face.zoom : 1) * 100) + '"></label>' +
          '<details class="drop"><summary title="Сдвиг портрета внутри круглой рамки">Смещение</summary>' +
          '<label title="Вправо сдвигает портрет вправо">Смещение по ширине<input id="face-x" type="range" min="0" max="100" value="' + Math.round(100 - (face ? face.x : 50)) + '"></label>' +
          '<label title="Вправо сдвигает портрет вниз">Смещение по высоте<input id="face-y" type="range" min="0" max="100" value="' + Math.round(100 - (face ? face.y : 50)) + '"></label></details>'
        : "";
      const sheet = npcFace ? window.ShirmoNpc.html(npcFace, (ctx.library().images) || []) : "";
      const images = (ctx.library().images) || [];
      const locShot = kind === "loc"
        ? (item.portrait ? '<img class="loc-shot" alt="" src="' + esc(item.portrait) + '">' : '<p class="note">Портрета точки пока нет. Он показывается на карте, как у НПС.</p>') +
          '<label class="file-btn" title="Загрузить портрет точки">Загрузить<input type="file" id="loc-face-file" accept="image/*" aria-label="Загрузить портрет точки"></label>' +
          '<label title="Портрет из библиотеки">Из библиотеки<select id="loc-face-lib" data-shelf="image"><option value="">Нет</option>' + images.map(function (image) {
            return '<option value="' + esc(image.url) + '"' + (image.url === item.portrait ? " selected" : "") + ">" + esc(image.name || "Картинка") + "</option>";
          }).join("") + "</select></label>"
        : "";
      const markBox = kind === "mark"
        ? '<div class="mark-pool">' + MARK_GLYPHS.map(function (glyph) {
          const on = item.emoji === glyph ? " is-on" : "";
          return '<button type="button" class="mark-pick' + on + '" data-mark-glyph="' + glyph + '" title="' + glyph + '">' + glyph + "</button>";
        }).join("") + "</div>" +
          '<label title="Свой эмодзи. Можно вместо значка из набора">Эмодзи<input id="mark-emoji" type="text" maxlength="16" value="' + esc(item.emoji || "") + '" placeholder="🙂"></label>' +
          (item.icon ? '<img class="loc-shot" alt="" src="' + esc(item.icon) + '">' : '<p class="note">Своей картинки нет. Тогда на метке значок или эмодзи.</p>') +
          '<label class="file-btn" title="Загрузить картинку значка. Она попадёт в библиотеку">Загрузить<input type="file" id="mark-icon-file" accept="image/*" aria-label="Загрузить значок"></label>' +
          '<label title="Картинка из библиотеки">Из библиотеки<select id="mark-icon-lib" data-shelf="image"><option value="">Нет</option>' + images.map(function (image) {
            return '<option value="' + esc(image.url) + '"' + (image.url === item.icon ? " selected" : "") + ">" + esc(image.name || "Картинка") + "</option>";
          }).join("") + "</select></label>" +
          (item.icon ? '<button type="button" id="mark-icon-clear">Убрать картинку</button>' : "")
        : "";
      const foeBox = kind === "foe"
        ? '<label title="Текущие хиты">Хиты<input id="foe-hp" type="number" min="0" value="' + esc(String(item.hp == null ? "" : item.hp)) + '"></label>' +
          '<label title="Максимум хитов">Максимум<input id="foe-max" type="number" min="1" value="' + esc(String(item.hpMax || 1)) + '"></label>' +
          '<label title="Класс доспеха">КД<input id="foe-ac" type="number" min="0" value="' + esc(String(item.ac || 10)) + '"></label>' +
          '<label title="Оружие в подписи броска">Оружие<input id="foe-weapon" type="text" value="' + esc(item.weapon || "") + '"></label>' +
          '<label title="Бонус к атаке">Атака<input id="foe-bonus" type="number" value="' + esc(String(item.bonus || 0)) + '"></label>' +
          '<label title="Формула урона, например 1d6+1">Урон<input id="foe-damage" type="text" value="' + esc(item.damage || "1d6") + '"></label>' +
          '<div class="row"><button type="button" data-act="foe-attack" title="Бросок атаки от имени врага. Игроки видят кубик">Атака</button><button type="button" data-act="foe-damage" title="Бросок урона от имени врага. Игроки видят кубик">Урон</button></div>'
        : "";
      const foeFace = kind === "foe"
        ? (item.portrait ? '<img class="loc-shot" alt="" src="' + esc(item.portrait) + '">' : '<p class="note">Портрета пока нет.</p>') +
          '<button type="button" data-act="foe-face" title="Взять портрет из справочника: уже сохранённый или портрет монстра">Из справочника</button>'
        : "";
      function group(title, tip, body, open) {
        return body ? '<details class="drop"' + (open ? " open" : "") + '><summary title="' + esc(tip) + '">' + title + "</summary>" + body + "</details>" : "";
      }
      const nameBox = kind === "label"
        ? '<label title="Enter — новая строка">Текст<textarea id="pin-label-text" rows="3">' + esc(item.text || "") + "</textarea></label>"
        : (kind === "loc" || kind === "mark"
          ? '<label title="Enter — новая строка">Название<textarea id="pin-name" rows="3">' + esc(item.name || "") + "</textarea></label>" +
            '<label class="check" title="Подпись над значком, а не под ним"><input id="pin-cap-top" type="checkbox"' + (item.capTop ? " checked" : "") + "> Сверху</label>"
          : "");
      const text = nameBox + '<label title="Размер подписи у точки">Размер текста<input id="pin-text-size" type="range" min="10" max="72" value="' + (Number(item.size) || (kind === "label" ? 28 : 14)) + '"></label>' +
        '<label title="Шрифт подписи">Шрифт<select id="pin-font">' + fontOptions + "</select></label>" +
        '<div class="row"><button type="button" id="pin-bold" class="' + (item.bold ? "is-on" : "") + '" title="Жирный">Ж</button><button type="button" id="pin-italic" class="' + (item.italic ? "is-on" : "") + '" title="Курсив">К</button><button type="button" id="pin-under" class="' + (item.underline ? "is-on" : "") + '" title="Подчёркнутый">Ч</button></div>' +
        '<label title="Цвет подписи">Цвет текста<input id="pin-ink" type="color" value="' + hexColor(item.ink, "#f3ead8") + '"></label>' +
        '<label title="Цвет контура букв">Обводка<input id="pin-stroke" type="color" value="' + hexColor(item.stroke, "#1a140c") + '"></label>' +
        '<label title="Толщина контура букв">Толщина обводки<input id="pin-stroke-w" type="range" min="0" max="8" value="' + (Number(item.strokeWidth) || 0) + '"></label>' +
        '<label class="check" title="Плашка под подписью"><input id="pin-plate-on" type="checkbox"' + (item.plate ? " checked" : "") + "> Фон текста</label>" +
        '<label title="Цвет плашки под подписью">Цвет фона<input id="pin-plate" type="color" value="' + hexColor(item.plate, "#14110e") + '"></label>';
      function vitalOn(key) { return item[key] !== false; }
      const vitalBox = kind === "hero"
        ? '<label class="check" title="Класс доспеха над портретом"><input id="vital-ac" type="checkbox"' + (vitalOn("vitalAc") ? " checked" : "") + "> КД</label>" +
          '<label class="check" title="Текущие хиты над портретом"><input id="vital-hp" type="checkbox"' + (vitalOn("vitalHp") ? " checked" : "") + "> Хиты</label>" +
          '<label class="check" title="10 + бонус Восприятия"><input id="vital-pp" type="checkbox"' + (vitalOn("vitalPp") ? " checked" : "") + "> Пассивное восприятие</label>" +
          '<label class="check" title="10 + бонус Анализа"><input id="vital-pi" type="checkbox"' + (vitalOn("vitalPi") ? " checked" : "") + "> Пассивный анализ</label>" +
          '<label title="Размер цифр над портретом">Размер<input id="vital-size" type="range" min="10" max="28" value="' + (Number(item.vitalSize) || 13) + '"></label>'
        : "";
      const toBattle = kind === "mark" || kind === "foe"
        ? '<label class="check" title="Левый клик по этой точке открывает экран боя"><input id="pin-to-battle" type="checkbox"' + (item.toBattle ? " checked" : "") + "> Левый клик открывает бой</label>"
        : "";
      const nameOn = kind === "npc"
        ? '<label class="check" title="По умолчанию имя на карте скрыто"><input id="pin-name-on" type="checkbox"' + (item.showName === true ? " checked" : "") + "> Имя на карте</label>"
        : "";
      return '<div class="pin-style">' +
        nameOn +
        (figureMode ? pin : "") +
        toBattle +
        group("Портрет", "Кадр, крупность и сдвиг портрета", foeFace || frame || locShot, kind === "foe") +
        group("Картинка", "Файл и библиотека", imageShot, true) +
        sheet +
        group("Бой", "Хиты, броня и броски от имени врага", foeBox, true) +
        group("Значок", "Набор, свой эмодзи, загрузка или библиотека", markBox, true) +
        group("Цифры", "Какие характеристики видны над портретом", vitalBox, true) +
        group("Точка", kind === "image" ? "Размер и видимость для игроков" : "Размер точки, заметка и видимость для игроков", (figureMode ? "" : pin) + note, kind === "loc" || kind === "image") +
        (kind === "image" ? "" : group("Подпись", "Шрифт, размер и оформление подписи", text)) +
        "</div>";
    }
    function openHeroRoll(id) {
      closeMenu();
      const marker = (view().markers || []).find(function (item) { return item && item.id === id && item.kind === "hero"; });
      if (!marker) return;
      const hero = (book().heroes || []).find(function (row) { return row && row.id === marker.heroId; });
      const pin = board.querySelector('[data-pin="' + id + '"]');
      if (!hero || !pin) return;
      function signed(n) {
        const v = Math.round(Number(n) || 0);
        return (v > 0 ? "+" : "") + v;
      }
      const stats = hero.stats || [];
      const skills = hero.skills || [];
      const saves = stats.map(function (stat, index) {
        const bonus = stat.save != null ? stat.save : stat.mod;
        return '<button type="button" class="hero-stat' + (stat.saveProf ? " is-prof" : "") + '" data-roll="save" data-i="' + index + '" title="Спасбросок ' + esc(stat.name || "") + '">' +
          "<em>" + esc(stat.name || "") + "</em><b>" + signed(bonus) + "</b></button>";
      }).join("");
      const skillHtml = skills.map(function (skill, index) {
        return '<button type="button" class="hero-skill' + (skill.trained ? " is-prof" : "") + (skill.expert ? " is-expert" : "") + '" data-roll="skill" data-i="' + index + '" title="Проверка ' + esc(skill.name || "навыка") + '">' +
          "<span>" + esc(skill.name || "Навык") + "</span><b>" + signed(skill.bonus) + "</b></button>";
      }).join("");
      const menu = document.createElement("div");
      menu.id = "pin-menu";
      menu.className = "pin-menu hero-roll";
      menu.innerHTML = "<h3>" + esc(hero.name || marker.name || "Герой") + "</h3>" +
        (saves ? '<p class="roll-cap">Спасброски</p><div class="hero-stats">' + saves + "</div>" : "") +
        (skillHtml ? '<p class="roll-cap">Навыки</p><div class="hero-skills">' + skillHtml + "</div>" : "") +
        (!saves && !skillHtml ? '<p class="note">В листе нет характеристик и навыков.</p>' : "");
      const rect = pin.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 276)) + "px";
      menu.style.top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 280)) + "px";
      document.body.appendChild(menu);
      menu.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
      menu.addEventListener("click", function (event) {
        const button = event.target.closest("[data-roll]");
        if (!button || !ctx.roll) return;
        const index = Number(button.getAttribute("data-i"));
        const rollKind = button.getAttribute("data-roll");
        const row = rollKind === "save" ? stats[index] : skills[index];
        if (!row) return;
        const bonus = rollKind === "save" ? (row.save != null ? row.save : row.mod) : row.bonus;
        ctx.roll({
          name: hero.name || marker.name || "Герой",
          label: rollKind === "save" ? ("Спас " + (row.name || "")) : (row.name || "Навык"),
          sides: 20,
          count: 1,
          mod: Math.round(Number(bonus) || 0)
        });
      });
    }
    function showMenu(at) {
      closeMenu();
      const item = findItem();
      if (!item || !selected) return;
      const pin = board.querySelector('[data-pin="' + selected.id + '"]');
      if (!pin) return;
      const rect = pin.getBoundingClientRect();
      const menu = document.createElement("div");
      menu.id = "pin-menu";
      menu.className = "pin-menu is-style";
      const bookBtn = selected.kind === "loc" || selected.kind === "npc";
      function actBtn(act, label) {
        return '<button type="button" class="pin-act" data-act="' + act + '" title="' + label + '" aria-label="' + label + '">' + ACT[act] + "</button>";
      }
      const canHome = selected.kind === "loc" || selected.kind === "npc" || selected.kind === "mark" || selected.kind === "foe" || selected.kind === "hero" || selected.kind === "label" || selected.kind === "image";
      const personId = markerPersonId(item);
      const inSquad = personId && (book().squads || []).some(function (squad) {
        return squad && (squad.memberIds || []).indexOf(personId) >= 0;
      });
      const squadBtn = inSquad && (selected.kind === "foe" || selected.kind === "npc")
        ? actBtn("unsquad", "Убрать весь отряд с карты, в справочнике он останется")
        : "";
      const actions = '<div class="pin-acts">' + (selected.kind === "label"
        ? actBtn("del", "Удалить надпись") + actBtn("rename", "Изменить текст") + actBtn("rehome", "Перенести в другую локацию")
        : actBtn("del", selected.kind === "image" ? "Удалить картинку" : "Удалить точку") + squadBtn + actBtn("copy", selected.kind === "image" ? "Копировать картинку" : "Копировать точку") + actBtn("move", "Перетащить") + (canHome ? actBtn("rehome", "Перенести в другую локацию") : "") + (selected.kind === "image" ? "" : actBtn("rename", "Изменить имя")) + (selected.kind === "loc" ? actBtn("setup", "Имя, день и ночь, фоны") : "") + (bookBtn ? actBtn("book", "Назначить запись из справочника") : "")) + "</div>";
      menu.innerHTML = styleHtml(item, selected.kind) + actions;
      const x = at && Number.isFinite(at.x) ? at.x : rect.left;
      const y = at && Number.isFinite(at.y) ? at.y : rect.bottom + 6;
      menu.style.left = x + "px";
      menu.style.top = y + "px";
      document.body.appendChild(menu);
      const box = menu.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(x, window.innerWidth - box.width - 8)) + "px";
      menu.style.top = Math.max(8, Math.min(y, window.innerHeight - box.height - 8)) + "px";
      menu.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
      function applyStyle() {
        const row = findItem();
        if (!row || !document.body.contains(menu)) return;
        const pinSize = menu.querySelector("#pin-size");
        const textSize = menu.querySelector("#pin-text-size");
        const font = menu.querySelector("#pin-font");
        if (pinSize) {
          const who = selected.kind === "npc" ? (linkedNpc(row) || row) : null;
          const figure = who && who.look !== "token" && row.look !== "token" && (who.portrait || row.portrait);
          if (figure) {
            const base = figureOf(who, false);
            who.mapH = fitFigure({ x: base.x, y: base.y, h: Number(pinSize.value) || base.h }).h;
          } else row.pinSize = Number(pinSize.value) || (selected.kind === "image" ? 120 : 14);
        }
        if (textSize) row.size = Number(textSize.value) || 14;
        if (font) {
          const found = ctx.fonts().find(function (entry) { return entry.font === font.value; });
          row.font = font.value;
          row.fontUrl = found ? found.url : "";
        }
        const bold = menu.querySelector("#pin-bold");
        if (bold) {
          row.bold = bold.classList.contains("is-on");
          row.italic = menu.querySelector("#pin-italic").classList.contains("is-on");
          row.underline = menu.querySelector("#pin-under").classList.contains("is-on");
          row.ink = menu.querySelector("#pin-ink").value;
          row.stroke = menu.querySelector("#pin-stroke").value;
          row.strokeWidth = Number(menu.querySelector("#pin-stroke-w").value) || 0;
          row.plate = menu.querySelector("#pin-plate-on").checked ? menu.querySelector("#pin-plate").value : "";
        }
        const capTop = menu.querySelector("#pin-cap-top");
        if (capTop) row.capTop = capTop.checked;
        const nameOn = menu.querySelector("#pin-name-on");
        if (nameOn) row.showName = nameOn.checked;
        const toBattle = menu.querySelector("#pin-to-battle");
        if (toBattle) row.toBattle = toBattle.checked;
        paintBoard();
        dirty();
      }
      menu.querySelectorAll("#pin-size, #pin-text-size, #pin-stroke-w").forEach(function (node) {
        node.addEventListener("input", applyStyle);
      });
      const pinFont = menu.querySelector("#pin-font");
      if (pinFont) pinFont.addEventListener("change", applyStyle);
      const pinInk = menu.querySelector("#pin-ink");
      if (pinInk) pinInk.addEventListener("input", applyStyle);
      const pinStroke = menu.querySelector("#pin-stroke");
      if (pinStroke) pinStroke.addEventListener("input", applyStyle);
      const pinPlate = menu.querySelector("#pin-plate");
      if (pinPlate) pinPlate.addEventListener("input", applyStyle);
      const pinPlateOn = menu.querySelector("#pin-plate-on");
      if (pinPlateOn) pinPlateOn.addEventListener("change", applyStyle);
      const pinCapTop = menu.querySelector("#pin-cap-top");
      if (pinCapTop) pinCapTop.addEventListener("change", applyStyle);
      const pinToBattle = menu.querySelector("#pin-to-battle");
      if (pinToBattle) pinToBattle.addEventListener("change", applyStyle);
      const pinNameOn = menu.querySelector("#pin-name-on");
      if (pinNameOn) pinNameOn.addEventListener("change", applyStyle);
      const pinName = menu.querySelector("#pin-name");
      if (pinName) pinName.addEventListener("input", function () {
        const row = findItem();
        if (!row) return;
        row.name = pinName.value;
        renameLinked(pinName.value);
        paintBoard();
        paintTree();
        dirty();
      });
      const pinLabelText = menu.querySelector("#pin-label-text");
      if (pinLabelText) pinLabelText.addEventListener("input", function () {
        const row = findItem();
        if (!row) return;
        row.text = pinLabelText.value;
        paintBoard();
        dirty();
      });
      const imageLib = menu.querySelector("#image-pin-lib");
      if (imageLib) imageLib.addEventListener("change", function () {
        const row = findItem();
        if (!row || !imageLib.value) return;
        row.url = imageLib.value;
        const hit = ((ctx.library().images) || []).find(function (image) { return image.url === row.url; });
        if (hit && hit.name) row.name = hit.name;
        paintBoard();
        dirty();
      });
      if (window.ShirmoShelf) window.ShirmoShelf.arm(menu);
      const imageFile = menu.querySelector("#image-pin-file");
      if (imageFile) imageFile.addEventListener("change", function (event) {
        const file = event.target.files && event.target.files[0];
        if (!file || !ctx.upload) return;
        ctx.upload(file).then(function (url) {
          const row = findItem();
          if (!row) return;
          if (!ctx.campaign.library) ctx.campaign.library = { fonts: [], images: [], notes: [] };
          if (window.ShirmoLib) window.ShirmoLib.keep(ctx.campaign.library, {
            url: url,
            name: file.name.replace(/\.[^.]+$/, ""),
            section: "map",
            sectionName: "Карта"
          });
          row.url = url;
          row.name = file.name.replace(/\.[^.]+$/, "") || row.name || "Картинка";
          paintBoard();
          dirty();
          showMenu();
        });
      });
      const pinTip = menu.querySelector("#pin-tip");
      if (pinTip) pinTip.addEventListener("input", function (event) {
        const row = findItem();
        if (!row) return;
        row.tip = event.target.value;
        paintBoard();
        dirty();
      });
      const pinHide = menu.querySelector("#pin-hide");
      if (pinHide) pinHide.addEventListener("change", function () {
        const row = findItem();
        if (!row) return;
        if (row.screen == null) row.screen = !row.hidden;
        row.hidden = pinHide.checked;
        paintBoard();
        dirty();
      });
      [["vital-ac", "vitalAc"], ["vital-hp", "vitalHp"], ["vital-pp", "vitalPp"], ["vital-pi", "vitalPi"]].forEach(function (pair) {
        const input = menu.querySelector("#" + pair[0]);
        if (!input) return;
        input.addEventListener("change", function () {
          const row = findItem();
          if (!row) return;
          row[pair[1]] = input.checked;
          paintBoard();
          dirty();
        });
      });
      const vitalSize = menu.querySelector("#vital-size");
      if (vitalSize) vitalSize.addEventListener("input", function () {
        const row = findItem();
        if (!row) return;
        row.vitalSize = Math.min(28, Math.max(10, Number(vitalSize.value) || 13));
        paintBoard();
        dirty();
      });
      const zoom = menu.querySelector("#face-zoom");
      const pick = menu.querySelector("#face-pick");
      function refreshFace(npc) {
        window.ShirmoNpc.write(npc);
        const pick = menu.querySelector("#face-pick");
        const img = pick && pick.querySelector("img");
        if (pick) pick.hidden = !npc.portrait;
        if (img && npc.portrait) {
          img.src = npc.portrait;
          img.setAttribute("style", faceStyle(npc));
        }
        const face = focusNums(npc);
        const shiftX = menu.querySelector("#face-x");
        const shiftY = menu.querySelector("#face-y");
        const zoomNode = menu.querySelector("#face-zoom");
        if (shiftX && document.activeElement !== shiftX) shiftX.value = String(Math.round(100 - face.x));
        if (shiftY && document.activeElement !== shiftY) shiftY.value = String(Math.round(100 - face.y));
        if (zoomNode && document.activeElement !== zoomNode) zoomNode.value = String(Math.round(face.zoom * 100));
        paintBoard();
        dirty();
      }
      function bindShift(node, key) {
        if (!node) return;
        node.addEventListener("input", function () {
          const npc = linkedNpc();
          if (!npc) return;
          npc[key] = 100 - Number(node.value);
          refreshFace(npc);
        });
      }
      if (zoom) zoom.addEventListener("input", function () {
        const npc = linkedNpc();
        if (!npc) return;
        npc.portraitZoom = Number(zoom.value) / 100;
        refreshFace(npc);
      });
      bindShift(menu.querySelector("#face-x"), "portraitX");
      bindShift(menu.querySelector("#face-y"), "portraitY");
      if (pick) {
        let pan = null;
        pick.addEventListener("pointerdown", function (event) {
          if (event.button !== 0) return;
          const npc = linkedNpc();
          if (!npc) return;
          event.preventDefault();
          event.stopPropagation();
          const face = focusNums(npc);
          pan = { x: event.clientX, y: event.clientY, ox: face.x, oy: face.y, zoom: face.zoom };
          pick.setPointerCapture(event.pointerId);
        });
        pick.addEventListener("pointermove", function (event) {
          if (!pan) return;
          const npc = linkedNpc();
          if (!npc) return;
          const rect = pick.getBoundingClientRect();
          const scale = pan.zoom || 1;
          npc.portraitX = Math.min(100, Math.max(0, pan.ox - (event.clientX - pan.x) / rect.width * 100 / scale));
          npc.portraitY = Math.min(100, Math.max(0, pan.oy - (event.clientY - pan.y) / rect.height * 100 / scale));
          refreshFace(npc);
        });
        function endPan() { pan = null; }
        pick.addEventListener("pointerup", endPan);
        pick.addEventListener("pointercancel", endPan);
      }
      const sheet = menu.querySelector("[data-npc-sheet]");
      if (sheet) {
        window.ShirmoNpc.bind(sheet, linkedNpc(item), {
          images: function () { return (ctx.library().images) || []; },
          upload: ctx.upload,
          keep: function (url, name) {
            const npc = linkedNpc(item);
            if (window.ShirmoLib) window.ShirmoLib.keep(ctx.library(), {
              url: url,
              name: name || (npc && npc.name) || "Портрет",
              section: npc && npc.id ? "npc:" + npc.id : "",
              sectionName: (npc && npc.name) || "НПС"
            });
          },
          syncFace: refreshFace,
          change: function () {
            paintBoard();
            dirty();
          }
        });
      }
      ["pin-bold", "pin-italic", "pin-under"].forEach(function (id) {
        const node = menu.querySelector("#" + id);
        if (!node) return;
        node.addEventListener("click", function (event) {
          event.currentTarget.classList.toggle("is-on");
          applyStyle();
        });
      });
      menu.addEventListener("click", function (event) {
        const button = event.target.closest("[data-act]");
        if (!button || !menu.contains(button)) return;
        const act = button.getAttribute("data-act");
        if (act === "del") removeItem();
        if (act === "unsquad") {
          const row = findItem();
          const who = row && markerPersonId(row);
          if (who) liftSquad(who);
          selected = null;
          closeMenu();
          paintBoard();
          paintTree();
          ctx.save();
        }
        if (act === "copy") copyItem();
        if (act === "rename") beginRename();
        if (act === "book") assignCodex();
        if (act === "setup") {
          const row = findItem();
          if (row) openSetup(row.id);
        }
        if (act === "move") {
          closeMenu();
          armedMove = true;
          host.querySelector("#map-hint").textContent = "Кликните новое место или перетащите точку.";
        }
        if (act === "rehome") {
          const row = findItem();
          if (row && selected) pickHome(selected.kind, selected.id, pin);
        }
        if (act === "foe-attack" || act === "foe-damage") rollFoe(act === "foe-damage");
        if (act === "foe-face" && window.ShirmoCodex && window.ShirmoCodex.pickMonsterFace) {
          const row = findItem();
          if (!row) return;
          window.ShirmoCodex.pickMonsterFace(function (url) {
            row.portrait = url;
            if (!row.pinSize) row.pinSize = 56;
            const personId = markerPersonId(row);
            const person = personId && (book().npcs || []).find(function (one) { return one && one.id === personId; });
            if (person && window.ShirmoCodex.writePortrait) window.ShirmoCodex.writePortrait(person, url);
            syncFoe(row);
            paintBoard();
            dirty();
            closeMenu();
          }, book().npcs);
        }
      });
      function syncFoe(row) {
        const battle = ctx.campaign && ctx.campaign.battle;
        if (!row || !battle) return;
        const actor = (battle.actors || []).find(function (one) { return one.id === row.actorId || one.markerId === row.id; });
        if (!actor) return;
        actor.name = row.name;
        actor.hp = row.hp;
        actor.hpMax = row.hpMax;
        actor.ac = row.ac;
        actor.weapon = row.weapon;
        actor.bonus = row.bonus;
        actor.damage = row.damage;
        actor.portrait = row.portrait || actor.portrait;
      }
      function readFoe() {
        const row = findItem();
        if (!row) return null;
        const hp = menu.querySelector("#foe-hp");
        const max = menu.querySelector("#foe-max");
        const ac = menu.querySelector("#foe-ac");
        const weapon = menu.querySelector("#foe-weapon");
        const bonus = menu.querySelector("#foe-bonus");
        const damage = menu.querySelector("#foe-damage");
        if (hp) row.hp = Math.max(0, Math.round(Number(hp.value) || 0));
        if (max) row.hpMax = Math.max(1, Math.round(Number(max.value) || 1));
        if (ac) row.ac = Math.max(0, Math.round(Number(ac.value) || 0));
        if (weapon) row.weapon = weapon.value;
        if (bonus) row.bonus = Math.round(Number(bonus.value) || 0);
        if (damage) row.damage = damage.value.trim() || "1d6";
        syncFoe(row);
        paintBoard();
        dirty();
        return row;
      }
      ["#foe-hp", "#foe-max", "#foe-ac", "#foe-weapon", "#foe-bonus", "#foe-damage"].forEach(function (sel) {
        const node = menu.querySelector(sel);
        if (node) node.addEventListener("input", readFoe);
      });
      function setLocPortrait(url) {
        const row = findItem();
        if (!row) return;
        row.portrait = url;
        if (row.placeId) {
          const place = (book().places || []).find(function (entry) { return entry.id === row.placeId; });
          if (place) place.portrait = url;
        }
        paintBoard();
        dirty();
      }
      const locLib = menu.querySelector("#loc-face-lib");
      if (locLib) locLib.addEventListener("change", function (event) { setLocPortrait(event.target.value); });
      const locFile = menu.querySelector("#loc-face-file");
      if (locFile) locFile.addEventListener("change", function (event) {
        const file = event.target.files && event.target.files[0];
        if (!file || !ctx.upload) return;
        ctx.upload(file).then(function (url) {
          if (!ctx.campaign.library) ctx.campaign.library = { fonts: [], images: [], notes: [] };
          if (window.ShirmoLib) window.ShirmoLib.keep(ctx.campaign.library, {
            url: url,
            name: file.name.replace(/\.[^.]+$/, ""),
            section: "places",
            sectionName: "Локации"
          });
          setLocPortrait(url);
        });
      });
      function setMarkIcon(url) {
        const row = findItem();
        if (!row) return;
        row.icon = url || "";
        if (!row.pinSize) row.pinSize = 36;
        paintBoard();
        dirty();
      }
      menu.querySelectorAll("[data-mark-glyph]").forEach(function (button) {
        button.addEventListener("click", function () {
          const row = findItem();
          if (!row) return;
          const glyph = button.getAttribute("data-mark-glyph") || "";
          row.emoji = row.emoji === glyph ? "" : glyph;
          if (!row.pinSize) row.pinSize = 36;
          const input = menu.querySelector("#mark-emoji");
          if (input) input.value = row.emoji;
          menu.querySelectorAll("[data-mark-glyph]").forEach(function (node) {
            node.classList.toggle("is-on", node.getAttribute("data-mark-glyph") === row.emoji);
          });
          paintBoard();
          dirty();
        });
      });
      const markEmoji = menu.querySelector("#mark-emoji");
      if (markEmoji) markEmoji.addEventListener("input", function () {
        const row = findItem();
        if (!row) return;
        row.emoji = markEmoji.value.trim().slice(0, 16);
        if (row.emoji && !row.pinSize) row.pinSize = 36;
        menu.querySelectorAll("[data-mark-glyph]").forEach(function (node) {
          node.classList.toggle("is-on", node.getAttribute("data-mark-glyph") === row.emoji);
        });
        paintBoard();
        dirty();
      });
      const markLib = menu.querySelector("#mark-icon-lib");
      if (markLib) markLib.addEventListener("change", function () { setMarkIcon(markLib.value); });
      const markClear = menu.querySelector("#mark-icon-clear");
      if (markClear) markClear.addEventListener("click", function () { setMarkIcon(""); });
      const markFile = menu.querySelector("#mark-icon-file");
      if (markFile) markFile.addEventListener("change", function (event) {
        const file = event.target.files && event.target.files[0];
        if (!file || !ctx.upload) return;
        ctx.upload(file).then(function (url) {
          if (!ctx.campaign.library) ctx.campaign.library = { fonts: [], images: [], notes: [] };
          if (window.ShirmoLib) window.ShirmoLib.keep(ctx.campaign.library, {
            url: url,
            name: file.name.replace(/\.[^.]+$/, ""),
            section: "Метки"
          });
          setMarkIcon(url);
        });
      });
      function rollFoe(damage) {
        const row = readFoe();
        if (!row || !ctx.roll) return;
        if (damage && window.ShirmoBattle) {
          const spec = window.ShirmoBattle.formula(row.damage || "1d6");
          ctx.roll({ name: row.name || "Враг", label: "Урон", count: spec.count, sides: spec.sides, bonus: spec.bonus });
          return;
        }
        ctx.roll({
          name: row.name || "Враг",
          label: row.weapon || "Атака",
          count: 1,
          sides: 20,
          bonus: Number(row.bonus) || 0
        });
      }
    }
    function hintBack() {
      armedMove = false;
      const hint = host.querySelector("#map-hint");
      if (hint) hint.textContent = "Левый клик открывает локацию или разговор, правый — правку. Скрытые точки видите только вы.";
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
          parentId: pendingParent || current.focusId || "",
          name: "Локация",
          x: at.x,
          y: at.y,
          tip: "",
          hidden: true,
          day: "",
          night: "",
          mode: "day",
          trashed: false
        });
        ensurePlace(current.locations[current.locations.length - 1]);
        pendingParent = "";
        host.querySelector("#map-hint").textContent = "Левый клик открывает локацию или разговор, правый — правку. Скрытые точки видите только вы.";
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
          underline: styleUnderline,
          locId: current.focusId || ""
        });
        selected = { kind: "label", id: id };
      } else if (kind === "image") {
        const url = (host.querySelector("#map-image-lib") && host.querySelector("#map-image-lib").value) || "";
        if (!url) {
          const hint = host.querySelector("#map-hint");
          if (hint) hint.textContent = "Сначала выберите или загрузите картинку.";
          return;
        }
        const images = (ctx.library().images) || [];
        const found = images.find(function (image) { return image.url === url; });
        current.markers.push({
          id: id,
          name: (found && found.name) || "Картинка",
          x: at.x,
          y: at.y,
          kind: "image",
          url: url,
          tip: "",
          hidden: false,
          screen: false,
          pinSize: Number(host.querySelector("#map-image-size").value) || 120,
          locId: current.focusId || ""
        });
        selected = { kind: "image", id: id };
      } else {
        const marker = {
          id: id,
          name: kind === "npc" ? "НПС" : "Метка",
          x: at.x,
          y: at.y,
          kind: kind === "npc" ? "npc" : "mark",
          tip: "",
          hidden: false,
          locId: current.focusId || ""
        };
        current.markers.push(marker);
        if (kind === "npc") ensureNpc(marker);
        selected = { kind: kind === "npc" ? "npc" : "mark", id: id };
      }
      shownForm = "";
      paintBoard();
      paintTree();
      paintSelected();
      ctx.save();
    }

    host._refresh = function () {
      paintLists();
      paintBoard();
      paintTree();
    };
    paintLists();
    paintBoard();
    paintSelected();
    syncPlaces();

    host.querySelector("#map-tools").addEventListener("click", function (event) {
      const button = event.target.closest("[data-tool]");
      if (!button) return;
      tool = button.getAttribute("data-tool");
      if (tool !== "loc") pendingParent = "";
      paintTools();
    });
    host.querySelector("#map-hero-list").addEventListener("click", function (event) {
      const button = event.target.closest("[data-hero]");
      if (!button) return;
      heroPick = button.getAttribute("data-hero") || "";
      paintHeroList();
      const hint = host.querySelector("#map-hint");
      const loc = view().focusId ? findLoc(view().focusId) : null;
      if (hint) hint.textContent = loc
        ? "Клик по карте ставит героя в «" + (loc.name || "локация") + "»."
        : "Клик по карте ставит героя. Откройте локацию, чтобы он встал внутрь неё.";
    });
    host.querySelector("#map-image-file").addEventListener("change", function (event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file || !ctx.upload) return;
      ctx.upload(file).then(function (url) {
        if (!ctx.campaign.library) ctx.campaign.library = { fonts: [], images: [], notes: [] };
        if (window.ShirmoLib) window.ShirmoLib.keep(ctx.campaign.library, {
          url: url,
          name: file.name.replace(/\.[^.]+$/, ""),
          section: "map",
          sectionName: "Карта"
        });
        fillImageLib(url);
        const hint = host.querySelector("#map-hint");
        if (hint) hint.textContent = "Картинка готова. Кликните по карте, чтобы поставить её.";
        dirty();
      });
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
    host.querySelector("#map-setup").addEventListener("click", function () { openSetup(view().focusId || ""); });
    host.querySelector("#map-loc-add").addEventListener("click", function () { addLocation(view().focusId || ""); });
    host.querySelector("#map-bin").addEventListener("click", function () {
      binOpen = !binOpen;
      paintBin();
    });
    host.querySelector("#map-bin-list").addEventListener("click", function (event) {
      const button = event.target.closest("[data-bin]");
      if (!button) return;
      const id = button.getAttribute("data-id");
      if (button.getAttribute("data-bin") === "back") {
        const loc = findLoc(id);
        if (loc) loc.trashed = false;
        paintBoard();
        paintTree();
        ctx.save();
      }
      if (button.getAttribute("data-bin") === "gone") purge(id);
      paintBoard();
      paintTree();
      ctx.save();
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
      levelSheet().mode = "day";
      paintTools();
      paintBoard();
      ctx.save();
    });
    host.querySelector("#map-night").addEventListener("click", function () {
      levelSheet().mode = "night";
      paintTools();
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
      const act = event.target.closest("[data-act]");
      if (act && host.querySelector("#map-tree").contains(act)) {
        const id = act.getAttribute("data-id");
        const what = act.getAttribute("data-act");
        if (what === "add") addLocation(id);
        if (what === "del") dropLocation(id);
        if (what === "setup") openSetup(id);
        return;
      }
      const button = event.target.closest("[data-loc]");
      if (!button) return;
      enter(button.getAttribute("data-loc"));
    });
    host.querySelector("#map-tree").addEventListener("contextmenu", function (event) {
      const button = event.target.closest("[data-loc]");
      if (!button || !host.querySelector("#map-tree").contains(button)) return;
      event.preventDefault();
      selected = { kind: "loc", id: button.getAttribute("data-loc") };
      pickHome("loc", selected.id, button);
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
      el.className = "tool-wheel is-icons";
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.innerHTML = '<span class="wheel-name"></span>' + TOOLS.map(function (item, index) {
        const deg = index * (360 / TOOLS.length);
        return '<button type="button" style="--a:' + deg + 'deg" title="' + esc(item[1]) + '" aria-label="' + esc(item[1]) + '" class="' + (tool === item[0] ? "is-on" : "") + '">' + item[2] + "</button>";
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
      return kind === "loc" || kind === "mark" || kind === "npc" || kind === "label" || kind === "foe" || kind === "hero" || kind === "image";
    }
    function flipFlag(item, which) {
      if (item.screen == null) item.screen = !item.hidden;
      if (which === "map") item.hidden = !item.hidden;
      else item.screen = item.screen === false;
      if (item.kind === "image") {
        const url = item.url || item.icon || "";
        if (which === "screen" && shownScreen(item) && url && ctx.showImage) ctx.showImage(url);
        else if (which === "screen" && !shownScreen(item) && ctx.hideImage) ctx.hideImage();
      }
      paintBoard();
      paintTree();
      dirty();
    }
    function onFlag(node) {
      const which = node.getAttribute("data-flag");
      if (which === "lamp") {
        const pin = node.closest("[data-pin]");
        const raw = pin
          ? (view().locations || []).find(function (row) { return row.id === pin.getAttribute("data-pin"); })
          : levelSheet();
        const loc = (raw && doorTarget(raw)) || raw;
        try { if (loc && window.ShirmoPlugins) window.ShirmoPlugins.lamp(loc, node); } catch (err) {}
        return;
      }
      const pin = node.closest("[data-pin]");
      if (pin) {
        const kind = pin.getAttribute("data-kind");
        const id = pin.getAttribute("data-pin");
        const current = view();
        const list = kind === "loc" ? current.locations : current.markers;
        const item = (list || []).find(function (row) { return row.id === id; });
        if (item) flipFlag(item, which);
        return;
      }
      const loc = findLoc(view().focusId || "");
      if (loc) flipFlag(loc, which);
    }
    function onDown(event) {
      const flag = event.target.closest && event.target.closest("[data-flag]");
      if (flag && board.contains(flag)) {
        if (event.button === 0) {
          event.preventDefault();
          event.stopPropagation();
          onFlag(flag);
        }
        return;
      }
      if (event.button === 1) {
        event.preventDefault();
        openWheel(event.clientX, event.clientY);
        return;
      }
      if (event.button === 2) {
        const hit = event.target.closest && event.target.closest("[data-pin]");
        if (hit && board.contains(hit) && pinKind(hit)) {
          event.preventDefault();
          closeMenu();
          selected = { kind: hit.getAttribute("data-kind"), id: hit.getAttribute("data-pin") };
          showMenu({ x: event.clientX, y: event.clientY });
        }
        return;
      }
      if (wheel) closeWheel();
      if (event.button !== 0) return;
      if (Date.now() < skipClick) {
        event.preventDefault();
        return;
      }
      if (view().talkId) return;
      const stage = board.querySelector(".stage");
      if (!stage || !board.contains(event.target)) return;
      const at = rel(event);
      const go = event.target.closest("[data-go]");
      if (go && board.contains(go)) {
        event.preventDefault();
        enter(go.getAttribute("data-go") || "");
        return;
      }
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
        press = { sx: event.clientX, sy: event.clientY, moved: false, figure: hit.hasAttribute("data-figure") };
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
        drag = hit.hasAttribute("data-figure") ? "figure" : true;
        shownForm = "";
        paintSelected();
        paintTree();
        return;
      }
      event.preventDefault();
      if (tool === "loc" || tool === "mark" || tool === "npc" || tool === "label" || tool === "image") {
        addPoint(tool, at);
        return;
      }
      if (tool === "hero") {
        placeHeroAt(at);
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
        points: [at, at],
        locId: view().focusId || ""
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
          drag = press.figure ? "figure" : true;
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
        if (drag === "figure") {
          const who = linkedNpc(item) || item;
          if (!figureDrag || figureDrag.id !== who.id) {
            const fig = mapFigureOf(who);
            figureDrag = { id: who.id, x: fig.x, y: fig.y, h: fig.h, px: at.x, py: at.y };
          }
          const next = fitFigure({
            x: figureDrag.x + (at.x - figureDrag.px) * 100,
            y: figureDrag.y - (at.y - figureDrag.py) * 100,
            h: figureDrag.h
          });
          who.mapX = next.x;
          who.mapY = next.y;
        } else {
          item.x = at.x;
          item.y = at.y;
        }
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
      const here = view().focusId || "";
      const before = view().strokes || [];
      const left = before.filter(function (stroke) {
        if ((stroke.locId || "") !== here) return true;
        return !strokeHits(stroke, at, radius);
      });
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
      if (event && event.button === 2) return;
      if (event && event.button === 1) {
        finishErase();
        if (wheel) pickWheel(event.clientX, event.clientY);
        return;
      }
      finishErase();
      if (press) {
        const open = !press.moved;
        const kind = selected && selected.kind;
        const id = selected && selected.id;
        press = null;
        if (open && kind === "loc") enter(id);
        else if (open && kind === "hero") openHeroRoll(id);
        else if (open && kind === "npc") {
          const row = (view().markers || []).find(function (item) { return item && item.id === id; });
          const npc = row && row.npcId && (book().npcs || []).find(function (item) { return item && item.id === row.npcId; });
          if (!npc || npc.role !== "enemy") openTalk(id);
        }
        else if (open && (kind === "mark" || kind === "foe")) {
          const row = (view().markers || []).find(function (item) { return item && item.id === id; });
          if (row && row.toBattle && ctx.openBattle) ctx.openBattle();
          else showMenu();
        }
        else if (open && kind === "image") {
          const row = (view().markers || []).find(function (item) { return item && item.id === id; });
          const url = row && (row.url || row.icon);
          const wasOpen = !!document.getElementById("map-image-zoom");
          zoomImage(url, false, function () {
            if (ctx.hideImage) ctx.hideImage();
          });
          if (!wasOpen && url && shownScreen(row) && ctx.showImage) ctx.showImage(url);
        }
        else if (open) showMenu();
      } else if (reopen) {
        reopen = false;
        showMenu();
      }
      if (drag) {
        drag = null;
        figureDrag = null;
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
      const talkMenu = document.getElementById("talk-menu");
      if (talkMenu && !talkMenu.contains(event.target)) talkMenu.remove();
      const menu = document.getElementById("pin-menu");
      if (!menu || menu.contains(event.target)) return;
      if (event.target.closest && event.target.closest("[data-pin]")) return;
      closeMenu();
    }
    board.addEventListener("dblclick", function (event) {
      const hit = event.target.closest("[data-pin]");
      if (!hit || !board.contains(hit)) return;
      const kind = hit.getAttribute("data-kind");
      if (kind === "loc" || kind === "npc" || kind === "image" || kind === "hero") {
        event.preventDefault();
        return;
      }
      selected = { kind: kind, id: hit.getAttribute("data-pin") };
      shownForm = "";
      beginRename();
    });
    board.addEventListener("contextmenu", function (event) {
      if (event.target.closest && event.target.closest("[data-pin]")) event.preventDefault();
    });
    board.addEventListener("mousedown", function (event) {
      if (event.button === 1) event.preventDefault();
    });
    board.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerdown", onDocDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.ShirmoMap.sync = function () {
      if (!host.isConnected) return;
      paintBoard();
      paintTools();
      paintTree();
      paintSelected();
    };
    window.ShirmoMap.light = tellLight;
    host._mapOff = function () {
      if (window.ShirmoMap) {
        window.ShirmoMap.sync = null;
        window.ShirmoMap.light = null;
      }
      window.removeEventListener("pointerdown", onDocDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      closeMenu();
      closeWheel();
      closeSetup();
      const rename = document.getElementById("pin-rename");
      if (rename) rename.remove();
      clearTimeout(timer);
    };
  }

  window.ShirmoGlyph = {
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    hide: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 19L19 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4.2-1.1L19 8.1 15.9 5 5.1 15.8 4 20z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M13.8 7.2l3 3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    fold: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cast: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="12" height="10" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 20h8M11 14v6M16 7.5l5 3-5 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V6M8.5 9.5L12 6l3.5 3.5M6 18h12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    speech: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a2 2 0 012 2v7a2 2 0 01-2 2h-8l-4 3.5V16H5a2 2 0 01-2-2V7a2 2 0 012-2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v9H4zM4 10l2-4h12l2 4M12 10v9M9.5 14.5h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'
  };

  const RARITY_COLORS = {
    1: "#f3ead8",
    2: "#4ade80",
    3: "#60a5fa",
    4: "#c084fc",
    5: "#fb923c",
    6: "#f472b6"
  };

  window.ShirmoItems = {
    ready: function () {
      if (window.allItems) return Promise.resolve();
      if (window.ShirmoItems._load) return window.ShirmoItems._load;
      window.ShirmoItems._load = new Promise(function (resolve, reject) {
        const node = document.createElement("script");
        node.src = "/catalog/items.js";
        node.onload = function () { resolve(); };
        node.onerror = function () { reject(new Error("Каталог предметов не загрузился")); };
        document.head.appendChild(node);
      });
      return window.ShirmoItems._load;
    },
    title: function (row) {
      return (row && row.ru && row.ru.name) || (row && row.en && row.en.name) || "Предмет";
    },
    icon: function (row) {
      return row && row.en && row.en.img ? "/catalog/img/items/" + encodeURIComponent(row.en.img) : "";
    },
    price: function (row) {
      const rarity = window.oRarity && row && row.en && window.oRarity[String(row.en.rarity)];
      return (rarity && rarity.coast) || "";
    },
    rarityOf: function (row) {
      const n = Number(row && row.en && row.en.rarity);
      return n >= 1 && n <= 6 ? n : 0;
    },
    rarityLabel: function (id) {
      const key = String(id || "");
      const row = window.oRarity && window.oRarity[key];
      return (row && row.text && row.text.ru && row.text.ru.title) || "";
    },
    rarityColor: function (id) {
      const n = Number(id) || 0;
      return RARITY_COLORS[n] || "";
    },
    rarityId: function (value) {
      const raw = String(value == null ? "" : value).trim().toLowerCase();
      if (!raw) return 0;
      if (/^[1-6]$/.test(raw)) return Number(raw);
      const map = {
        "обычная": 1, "обычный": 1, "обычное": 1, common: 1,
        "необычная": 2, "необычный": 2, "необычное": 2, uncommon: 2,
        "редкая": 3, "редкий": 3, "редкое": 3, rare: 3,
        "очень редкая": 4, "очень редкий": 4, "очень редкое": 4, "very rare": 4, "veryrare": 4,
        "легендарная": 5, "легендарный": 5, "легендарное": 5, legendary: 5,
        "артефакт": 6, artifact: 6
      };
      if (map[raw]) return map[raw];
      if (window.oRarity) {
        const hit = Object.keys(window.oRarity).find(function (key) {
          const row = window.oRarity[key];
          const ru = row && row.text && row.text.ru && row.text.ru.title || "";
          const en = row && row.text && row.text.en && row.text.en.title || "";
          return ru.toLowerCase() === raw || en.toLowerCase() === raw;
        });
        if (hit) return Number(hit) || 0;
      }
      return 0;
    },
    rarityOptions: function (selected) {
      const cur = Number(selected) || 0;
      let html = '<option value="">Без редкости</option>';
      [1, 2, 3, 4, 5, 6].forEach(function (id) {
        const label = window.ShirmoItems.rarityLabel(id) || ("Редкость " + id);
        html += '<option value="' + id + '"' + (cur === id ? " selected" : "") + " style=\"color:" +
          (RARITY_COLORS[id] || "inherit") + '">' + label + "</option>";
      });
      return html;
    },
    applyRarity: function (item) {
      if (!item) return "";
      const id = window.ShirmoItems.rarityId(item.rarity);
      item.rarity = id || "";
      const color = window.ShirmoItems.rarityColor(id);
      if (color) item.ink = color;
      else if (!id) item.ink = item.ink || "";
      return color;
    },
    inkOf: function (item) {
      if (!item) return "";
      const fromRarity = window.ShirmoItems.rarityColor(window.ShirmoItems.rarityId(item.rarity));
      return fromRarity || item.ink || "";
    },
    findIcon: function (value) {
      const raw = String(value || "").trim();
      if (!raw) return "";
      if (raw.indexOf("/catalog/") === 0 || raw.indexOf("http") === 0) return raw;
      if (!window.allItems) return raw;
      const lower = raw.toLowerCase();
      const file = decodeURIComponent(raw.split("?")[0].split("/").pop() || "").toLowerCase();
      const row = window.allItems.find(function (item) {
        const img = item.en && item.en.img ? String(item.en.img).toLowerCase() : "";
        const ru = item.ru && item.ru.name ? String(item.ru.name).toLowerCase() : "";
        const en = item.en && item.en.name ? String(item.en.name).toLowerCase() : "";
        return img === file || img === lower || ru === lower || en === lower;
      });
      return row ? window.ShirmoItems.icon(row) : raw;
    },
    catalogFile: function (icon) {
      const text = String(icon || "");
      if (text.indexOf("/catalog/img/items/") !== 0) return "";
      return decodeURIComponent(text.split("?")[0].split("/").pop() || "");
    },
    find: function (q) {
      const query = String(q || "").trim().toLowerCase();
      if (query.length < 2 || !window.allItems) return [];
      return window.allItems.filter(function (row) {
        const ru = row.ru && row.ru.name || "";
        const en = row.en && row.en.name || "";
        return (ru + " " + en).toLowerCase().indexOf(query) >= 0;
      });
    }
  };

  window.ShirmoLib = {
    keep: function (library, item) {
      if (!library || !item || !item.url) return;
      library.images = library.images || [];
      if (library.images.some(function (row) { return row.url === item.url; })) return;
      const section = item.section || "";
      const folder = item.folder || (section === "icons" ? "Иконки товаров" : section.indexOf("npc:") === 0 ? (item.sectionName || "НПС") : (section || "Общее"));
      library.images.push({
        id: crypto.randomUUID(),
        name: item.name || "Картинка",
        url: item.url,
        section: section,
        sectionName: item.sectionName || "",
        folder: folder
      });
    },
    title: function (image, npcs) {
      if (!image) return "Общее";
      if (image.section === "icons") return "Иконки товаров";
      if (image.section && String(image.section).indexOf("npc:") === 0) {
        const id = String(image.section).slice(4);
        const npc = (npcs || []).find(function (row) { return row && row.id === id; });
        return (npc && npc.name) || image.sectionName || "НПС";
      }
      return image.section || "Общее";
    }
  };

  const MOOD_FACES = "🙂 😊 😀 😄 😁 😉 😌 😐 😑 😒 😏 😔 😢 😭 😤 😠 😡 🤬 😨 😰 😱 😳 🤔 😴 🥱 😎 🥰 😍 🤩 😈 💀 🤢 🤮 🤯 😶 🙄 😬 🤗 🥺 😷 🤒 😵 🤪 😜 🫡 🤡 👻".split(" ");

  function moodFace(item) {
    const face = focusNums(item);
    return {
      portrait: item && item.portrait ? item.portrait : "",
      portraitX: face.x,
      portraitY: face.y,
      portraitZoom: face.zoom,
      emoji: String(item && item.emoji || "").trim().slice(0, 16)
    };
  }

  window.ShirmoNpc = {
    apply: function (npc) {
      if (!npc) return { portrait: "" };
      if (!Array.isArray(npc.moods) || !npc.moods.length) npc.moods = [moodFace(npc)];
      npc.moods = npc.moods.map(function (mood) { return moodFace(mood || {}); });
      npc.mood = Math.min(npc.moods.length - 1, Math.max(0, Number(npc.mood) || 0));
      const mood = npc.moods[npc.mood];
      npc.portrait = mood.portrait;
      npc.portraitX = mood.portraitX;
      npc.portraitY = mood.portraitY;
      npc.portraitZoom = mood.portraitZoom;
      npc.emoji = mood.emoji || "";
      return mood;
    },
    write: function (npc) {
      if (!npc) return;
      if (!Array.isArray(npc.moods) || !npc.moods.length) npc.moods = [moodFace(npc)];
      npc.mood = Math.min(npc.moods.length - 1, Math.max(0, Number(npc.mood) || 0));
      npc.moods[npc.mood] = moodFace(npc);
    },
    lines: function (record) {
      if (!record) return [];
      if (!Array.isArray(record.lines)) record.lines = [];
      record.lines = record.lines.map(function (row) {
        const source = row && typeof row === "object" ? row : { text: String(row || "") };
        const phase = source.phase === 0 || source.phase ? source.phase : "";
        return {
          theme: String(source.theme || ""),
          text: String(source.text || ""),
          ink: String(source.ink || ""),
          font: String(source.font || ""),
          plate: String(source.plate || ""),
          phase: phase === "" ? "" : String(Math.max(0, Number(phase) || 0))
        };
      });
      return record.lines;
    },
    replicas: function (record) {
      return window.ShirmoNpc.lines(record).filter(function (row) {
        return String(row.theme || "").trim() || String(row.text || "").trim();
      });
    },
    label: function (row) {
      const theme = String(row && row.theme || "").trim();
      const text = String(row && row.text || "").trim();
      return theme || text || "...";
    },
    html: function (npc, images, index, extra) {
      window.ShirmoNpc.apply(npc);
      const opts = extra || {};
      const fonts = opts.fonts && opts.fonts.length ? opts.fonts : [
        { name: "Georgia", font: "Georgia, serif" },
        { name: "Arial", font: "Arial, sans-serif" },
        { name: "Times", font: "Times New Roman, serif" },
        { name: "Verdana", font: "Verdana, sans-serif" },
        { name: "Courier", font: "Courier New, monospace" }
      ];
      const lines = window.ShirmoNpc.lines(npc);
      const rows = lines.map(function (row, rowIndex) {
        const phaseOptions = '<option value="">По умолчанию</option>' + npc.moods.map(function (mood, moodIndex) {
          const on = String(row.phase) === String(moodIndex) ? " selected" : "";
          return '<option value="' + moodIndex + '"' + on + ">Фаза " + (moodIndex + 1) + (mood.emoji ? " " + esc(mood.emoji) : "") + "</option>";
        }).join("");
        const fontOptions = '<option value="">Шрифт</option>' + fonts.map(function (item) {
          return '<option value="' + esc(item.font) + '"' + (item.font === row.font ? " selected" : "") + ">" + esc(item.name) + "</option>";
        }).join("");
        return '<div class="rep-row">' +
          '<input data-rep-theme data-i="' + rowIndex + '" type="text" value="' + esc(row.theme) + '" placeholder="Тема" title="Подпись кнопки. Если пусто, на кнопке будет текст" aria-label="Тема">' +
          '<input data-rep-text data-i="' + rowIndex + '" type="text" value="' + esc(row.text) + '" placeholder="Текст" title="Что говорит персонаж" aria-label="Текст">' +
          '<button type="button" data-rep-del data-i="' + rowIndex + '" title="Убрать реплику" aria-label="Убрать реплику">×</button>' +
          '<div class="rep-look">' +
          '<input data-rep-ink data-i="' + rowIndex + '" type="color" value="' + esc(row.ink || "#f3ead8") + '" title="Цвет кнопки" aria-label="Цвет кнопки">' +
          '<input data-rep-plate data-i="' + rowIndex + '" type="color" value="' + esc(row.plate || "#1a140c") + '" title="Фон кнопки" aria-label="Фон кнопки">' +
          '<select data-rep-font data-i="' + rowIndex + '" title="Шрифт кнопки" aria-label="Шрифт кнопки">' + fontOptions + "</select>" +
          '<select data-rep-phase data-i="' + rowIndex + '" title="В режиме «по реплике» включает эту фазу. Пусто — эмоция по умолчанию" aria-label="Фаза реплики">' + phaseOptions + "</select>" +
          "</div></div>";
      }).join("");
      const replies = '<div class="rep-list">' + rows + '</div>' +
        '<button type="button" data-rep-add title="Добавить реплику">Добавить реплику</button>';
      if (opts.linesOnly) {
        return '<div class="npc-sheet" data-npc-sheet data-lines-only>' + replies + "</div>";
      }
      const mood = npc.moods[npc.mood];
      const max = Math.max(0, npc.moods.length - 1);
      const options = '<option value="">Из библиотеки</option>' + (images || []).map(function (image) {
        const section = window.ShirmoLib ? window.ShirmoLib.title(image) : "";
        const label = section && section !== "Общее" ? section + " — " + (image.name || "Картинка") : (image.name || "Картинка");
        return '<option value="' + esc(image.url) + '">' + esc(label) + "</option>";
      }).join("");
      const mark = index == null ? "" : ' data-i="' + index + '"';
      return '<div class="npc-sheet" data-npc-sheet' + mark + '>' +
        '<details class="drop"><summary title="Тема, текст, вид кнопки и фаза, на которую реплика переключает персонажа">Реплики</summary>' +
        replies + "</details>" +
        '<details class="drop"><summary title="Фазы настроения: у каждой свой портрет и эмодзи, ползунок переключает текущую">Настроение</summary>' +
        '<label title="Переключить фазу настроения">Фаза<input data-mood type="range" min="0" max="' + max + '" value="' + npc.mood + '"' + (max < 1 ? " disabled" : "") + "></label>" +
        '<p class="note" data-mood-label>' + (npc.mood + 1) + " из " + npc.moods.length + "</p>" +
        '<div class="mood-emoji-field"><label title="Эмодзи этой фазы. Видно только мастеру">Эмодзи<input data-mood-emoji type="text" maxlength="16" value="' + esc(mood.emoji || "") + '" placeholder="🙂" aria-label="Эмодзи фазы"></label>' +
        '<button type="button" data-mood-pick title="Выбрать эмодзи из списка">Выбрать</button></div>' +
        '<div class="mood-faces" data-mood-faces hidden><button type="button" data-mood-face="" title="Убрать эмодзи"' + (mood.emoji ? "" : ' class="is-on"') + '>−</button>' +
        MOOD_FACES.map(function (face) {
          return '<button type="button" data-mood-face="' + face + '" title="' + face + '"' + (mood.emoji === face ? ' class="is-on"' : "") + ">" + face + "</button>";
        }).join("") + "</div>" +
        '<div class="mood-frame" data-mood-frame' + (mood.portrait ? "" : " hidden") + '><img class="mood-preview" alt="" data-mood-preview src="' + esc(mood.portrait) + '" style="' + faceStyle(mood) + '"><span class="mood-badge" data-mood-badge>' + esc(mood.emoji || "") + "</span></div>" +
        '<div class="mood-tools">' +
        '<label class="mood-file" title="Загрузить портрет этой фазы">Загрузить<input type="file" accept="image/*" data-mood-file></label>' +
        '<select data-mood-lib data-shelf="image" title="Взять портрет этой фазы из библиотеки">' + options + "</select>" +
        '<button type="button" data-mood-add title="Добавить фазу настроения">+</button>' +
        '<button type="button" data-mood-del title="Убрать эту фазу"' + (npc.moods.length < 2 ? " disabled" : "") + ">×</button>" +
        "</div></details></div>";
    },
    bind: function (root, npc, hooks) {
      if (!root || !npc || root._npcBound) return;
      root._npcBound = true;
      const opts = hooks || {};
      function images() { return opts.images ? opts.images() : []; }
      function paintSheet() {
        const opens = [].map.call(root.querySelectorAll(":scope > details.drop"), function (node) { return node.open; });
        const fresh = document.createElement("div");
        fresh.innerHTML = window.ShirmoNpc.html(npc, images(), root.getAttribute("data-i"), {
          fonts: opts.fonts ? opts.fonts() : null,
          linesOnly: root.hasAttribute("data-lines-only")
        });
        const next = fresh.firstElementChild;
        root.innerHTML = next.innerHTML;
        [].forEach.call(root.querySelectorAll(":scope > details.drop"), function (node, index) {
          if (opens[index]) node.open = true;
        });
      }
      function preview(mood) {
        const node = root.querySelector("[data-mood-preview]");
        const frame = root.querySelector("[data-mood-frame]");
        const badge = root.querySelector("[data-mood-badge]");
        const emoji = root.querySelector("[data-mood-emoji]");
        const label = root.querySelector("[data-mood-label]");
        if (label) label.textContent = (npc.mood + 1) + " из " + npc.moods.length;
        if (badge) badge.textContent = mood.emoji || "";
        if (emoji && document.activeElement !== emoji) emoji.value = mood.emoji || "";
        if (frame) frame.hidden = !mood.portrait;
        if (!node) return;
        if (mood.portrait) {
          node.src = mood.portrait;
          node.setAttribute("style", faceStyle(mood));
        }
      }
      function changed() { if (opts.change) opts.change(); }
      function showFace() {
        const mood = window.ShirmoNpc.apply(npc);
        preview(mood);
        if (opts.syncFace) opts.syncFace(npc);
      }
      root.addEventListener("input", function (event) {
        const theme = event.target.closest("[data-rep-theme]");
        const text = event.target.closest("[data-rep-text]");
        const lineField = event.target.closest("[data-rep-theme], [data-rep-text], [data-rep-ink], [data-rep-plate], [data-rep-font], [data-rep-phase]");
        if (lineField && root.contains(lineField)) {
          const row = npc.lines[Number(lineField.getAttribute("data-i"))];
          if (!row) return;
          if (lineField.hasAttribute("data-rep-theme")) row.theme = lineField.value;
          if (lineField.hasAttribute("data-rep-text")) row.text = lineField.value;
          if (lineField.hasAttribute("data-rep-ink")) row.ink = lineField.value;
          if (lineField.hasAttribute("data-rep-plate")) row.plate = lineField.value;
          if (lineField.hasAttribute("data-rep-font")) row.font = lineField.value;
          if (lineField.hasAttribute("data-rep-phase")) row.phase = lineField.value;
          changed();
          return;
        }
        if (event.target.hasAttribute("data-mood-emoji")) {
          window.ShirmoNpc.apply(npc);
          const value = String(event.target.value || "").trim().slice(0, 16);
          npc.moods[npc.mood].emoji = value;
          npc.emoji = value;
          const badge = root.querySelector("[data-mood-badge]");
          if (badge) badge.textContent = value;
          if (opts.syncFace) opts.syncFace(npc);
          changed();
          return;
        }
        if (event.target.hasAttribute("data-mood")) {
          npc.mood = Number(event.target.value) || 0;
          npc.moodHold = true;
          showFace();
          changed();
        }
      });
      root.addEventListener("change", function (event) {
        const lineField = event.target.closest("[data-rep-font], [data-rep-phase], [data-rep-ink], [data-rep-plate]");
        if (lineField && root.contains(lineField)) {
          const row = npc.lines[Number(lineField.getAttribute("data-i"))];
          if (!row) return;
          if (lineField.hasAttribute("data-rep-ink")) row.ink = lineField.value;
          if (lineField.hasAttribute("data-rep-plate")) row.plate = lineField.value;
          if (lineField.hasAttribute("data-rep-font")) row.font = lineField.value;
          if (lineField.hasAttribute("data-rep-phase")) row.phase = lineField.value;
          changed();
          return;
        }
        if (event.target.hasAttribute("data-mood-lib")) {
          const url = event.target.value;
          if (!url) return;
          window.ShirmoNpc.apply(npc);
          npc.portrait = url;
          window.ShirmoNpc.write(npc);
          paintSheet();
          showFace();
          changed();
          return;
        }
        if (!event.target.hasAttribute("data-mood-file")) return;
        const file = event.target.files && event.target.files[0];
        event.target.value = "";
        if (!file || !opts.upload) return;
        opts.upload(file).then(function (url) {
          window.ShirmoNpc.apply(npc);
          npc.portrait = url;
          window.ShirmoNpc.write(npc);
          if (opts.keep) opts.keep(url, file.name.replace(/\.[^.]+$/, ""));
          paintSheet();
          showFace();
          changed();
        });
      });
      root.addEventListener("click", function (event) {
        const pick = event.target.closest("[data-mood-pick]");
        if (pick && root.contains(pick)) {
          const box = root.querySelector("[data-mood-faces]");
          if (box) box.hidden = !box.hidden;
          return;
        }
        const face = event.target.closest("[data-mood-face]");
        if (face && root.contains(face)) {
          window.ShirmoNpc.apply(npc);
          const value = face.getAttribute("data-mood-face") || "";
          npc.moods[npc.mood].emoji = value;
          npc.emoji = value;
          const input = root.querySelector("[data-mood-emoji]");
          const badge = root.querySelector("[data-mood-badge]");
          if (input) input.value = value;
          if (badge) badge.textContent = value;
          root.querySelectorAll("[data-mood-face]").forEach(function (node) {
            node.classList.toggle("is-on", (node.getAttribute("data-mood-face") || "") === value);
          });
          const box = root.querySelector("[data-mood-faces]");
          if (box) box.hidden = true;
          if (opts.syncFace) opts.syncFace(npc);
          changed();
          return;
        }
        const button = event.target.closest("[data-rep-add], [data-rep-del], [data-mood-add], [data-mood-del]");
        if (!button || !root.contains(button)) return;
        if (button.hasAttribute("data-rep-add")) {
          window.ShirmoNpc.lines(npc).push({ theme: "", text: "", ink: "", font: "", plate: "", phase: "" });
          paintSheet();
          changed();
          const last = root.querySelector(".rep-row:last-child [data-rep-theme]");
          if (last) last.focus();
          return;
        }
        if (button.hasAttribute("data-rep-del")) {
          npc.lines.splice(Number(button.getAttribute("data-i")), 1);
          paintSheet();
          changed();
          return;
        }
        if (button.hasAttribute("data-mood-add")) {
          window.ShirmoNpc.apply(npc);
          npc.moods.push({ portrait: "", portraitX: 50, portraitY: 50, portraitZoom: 1 });
          npc.mood = npc.moods.length - 1;
          window.ShirmoNpc.apply(npc);
          paintSheet();
          showFace();
          changed();
          return;
        }
        if (npc.moods.length < 2) return;
        window.ShirmoNpc.apply(npc);
        npc.moods.splice(npc.mood, 1);
        if (npc.mood >= npc.moods.length) npc.mood = npc.moods.length - 1;
        window.ShirmoNpc.apply(npc);
        paintSheet();
        showFace();
        changed();
      });
    }
  };

  window.ShirmoMap = {
    ensure: ensure,
    mount: mount,
    html: html,
    ping: ping,
    zoomImage: zoomImage,
    closeZoomImage: closeZoomImage,
    bindImages: bindImages
  };
})();
