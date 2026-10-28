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

export function blankCampaign(pageId) {
  const viewId = pageId + "-view";
  return {
    stage: { width: 1368, height: 786 },
    activePageId: pageId,
    shownPageId: pageId,
    library: { fonts: [], images: [], notes: [] },
    pages: [
      {
        id: pageId,
        name: "Сцена 1",
        kind: "note",
        title: "",
        text: "",
        color: "#16130f",
        ink: "#f3ead8",
        size: 64,
        font: "Georgia, serif",
        fontUrl: "",
        image: ""
      },
      {
        id: pageId + "-map",
        name: "Карта",
        kind: "map",
        views: [blankView(viewId)],
        activeViewId: viewId
      }
    ]
  };
}

function unit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function clip(value, size) {
  return String(value || "").slice(0, size);
}

function axis(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 50;
}

function zoomOf(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(3, Math.max(1, n)) : 1;
}

function activeFace(npc) {
  const moods = npc && Array.isArray(npc.moods) ? npc.moods.filter(Boolean) : [];
  const index = moods.length ? Math.min(moods.length - 1, Math.max(0, Number(npc.mood) || 0)) : -1;
  const mood = index >= 0 ? moods[index] : null;
  const portrait = (mood && mood.portrait) || (npc && npc.portrait) || "";
  const source = mood && mood.portrait ? mood : (npc || {});
  return {
    portrait: portrait,
    x: axis(source.portraitX),
    y: axis(source.portraitY),
    zoom: zoomOf(source.portraitZoom)
  };
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

function npcSheets(npc, campaign) {
  const sheets = campaign && campaign.codex && Array.isArray(campaign.codex.wares) ? campaign.codex.wares : [];
  if (!npc) return [];
  return sheets.filter(function (sheet) {
    return sheet && (sheet.npcId === npc.id || sheet.id === npc.wareId);
  });
}

function moneyText(item, campaign) {
  const coins = campaign && campaign.codex && Array.isArray(campaign.codex.coins) ? campaign.codex.coins : [];
  if (item && item.coin) {
    const coin = coins.find(function (row) { return row && row.id === item.coin; });
    const code = coin ? String(coin.code || coin.name || "") : "";
    const amount = item.price == null || item.price === "" ? "" : String(item.price);
    return clip([amount, code].filter(Boolean).join(" "), 40);
  }
  return clip(item && item.price, 40);
}

function saleRows(npc, campaign) {
  if (!npc) return [];
  const own = Array.isArray(npc.goods) ? npc.goods : [];
  const listed = npcSheets(npc, campaign).reduce(function (all, sheet) {
    return all.concat(Array.isArray(sheet.items) ? sheet.items : []);
  }, []);
  return own.concat(listed).filter(function (item) {
    return item && String(item.name || "").trim() && !item.off && !stockHidden(item);
  }).slice(0, 40).map(function (item) {
    const qty = stockQty(item);
    const row = {
      name: clip(item.name, 80),
      price: moneyText(item, campaign),
      icon: item.icon ? clip(item.icon, 300) : "",
      note: clip(item.note, 400)
    };
    if (qty != null) row.qty = qty;
    const rarity = Number(item.rarity) || 0;
    if (rarity >= 1 && rarity <= 6) row.rarity = rarity;
    if (item.ink) row.ink = clip(item.ink, 20);
    return row;
  });
}

function standOf(record, shop) {
  const own = record && (shop ? record.stall : record.stand);
  const slot = own || (shop && record ? record.stand : null);
  function axisOf(value, min, max, fallback) {
    if (value == null || value === "") return fallback;
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }
  return {
    x: axisOf(slot && slot.x, -80, 140, 3),
    y: axisOf(slot && slot.y, -80, 140, 2),
    h: axisOf(slot && slot.h, 8, 220, 86)
  };
}

function replicas(record) {
  const raw = record && Array.isArray(record.lines) ? record.lines : [];
  return raw.map(function (row) {
    if (row && typeof row === "object") return { theme: String(row.theme || "").trim(), text: String(row.text || "").trim() };
    return { theme: "", text: String(row || "").trim() };
  }).filter(function (row) { return row.theme || row.text; });
}

function textLook(item, fallbackSize) {
  return {
    size: Math.min(96, Math.max(10, Number(item.size) || fallbackSize)),
    font: clip(item.font, 120) || "Georgia, serif",
    fontUrl: clip(item.fontUrl, 300),
    ink: clip(item.ink, 20) || "#f3ead8",
    bold: !!item.bold,
    italic: !!item.italic,
    underline: !!item.underline,
    stroke: clip(item.stroke, 20) || "#1a140c",
    strokeWidth: Math.min(8, Math.max(0, Number(item.strokeWidth) || 0)),
    plate: clip(item.plate, 20)
  };
}

function projectMap(page, campaign) {
  const views = Array.isArray(page.views) ? page.views : [];
  const view = views.find(function (item) { return item.id === page.activeViewId; }) || views[0] || {};
  const locationsAll = Array.isArray(view.locations) ? view.locations : [];
  function locById(id) {
    return locationsAll.find(function (item) { return item && item.id === id; });
  }
  function chainTrashed(id) {
    let cursor = id;
    let guard = 0;
    while (cursor && guard < 24) {
      const loc = locById(cursor);
      if (!loc || loc.trashed) return true;
      cursor = loc.parentId || "";
      guard += 1;
    }
    return false;
  }
  function shownOnScreen(item) {
    if (!item) return false;
    if (item.screen === false) return false;
    if (item.screen === true) return true;
    return !item.hidden;
  }
  let here = view.focusId || "";
  if (here && !locById(here)) here = "";
  const gmHere = here;
  let guard = 0;
  while (here && guard < 24) {
    const loc = locById(here);
    if (loc && shownOnScreen(loc) && !chainTrashed(here)) break;
    here = loc ? (loc.parentId || "") : "";
    guard += 1;
  }
  const placeOff = (gmHere || "") !== (here || "");
  const focused = here ? locById(here) : null;
  const night = focused ? focused.mode === "night" : view.mode === "night";
  const sheet = focused || view;
  const places = campaign && campaign.codex && Array.isArray(campaign.codex.places) ? campaign.codex.places : [];
  const focusedPlace = focused && focused.placeId
    ? places.find(function (row) { return row && row.id === focused.placeId; })
    : null;
  const placeBackdrop = focusedPlace && focusedPlace.backdrop ? focusedPlace.backdrop : "";
  const image = night
    ? (sheet.night || sheet.day || placeBackdrop || "")
    : (sheet.day || placeBackdrop || "");
  const npcs = campaign && campaign.codex && Array.isArray(campaign.codex.npcs) ? campaign.codex.npcs : [];
  const locations = locationsAll.filter(function (item) {
    return item && !item.hidden && !item.trashed && (item.parentId || "") === here;
  }).slice(0, 200).map(function (item) {
    const place = item.placeId
      ? places.find(function (row) { return row && row.id === item.placeId; })
      : null;
    const face = item.portrait || (place && place.portrait) || "";
    const portrait = picture(face);
    const source = item.portrait ? item : (place || {});
    return Object.assign({
      id: clip(item.id, 80),
      name: clip(item.name, 240),
      x: unit(item.x),
      y: unit(item.y),
      tip: clip(item.tip, 400),
      capTop: item.capTop === true,
      pinSize: Math.min(160, Math.max(12, Number(item.pinSize) || (portrait ? 56 : 14))),
      portrait: portrait,
      portraitX: portrait ? axis(source.portraitX) : 50,
      portraitY: portrait ? axis(source.portraitY) : 50,
      portraitZoom: portrait ? zoomOf(source.portraitZoom) : 1
    }, textLook(item, 14));
  });
  const markers = (Array.isArray(view.markers) ? view.markers : []).filter(function (item) {
    return item && !item.hidden && item.screen !== false && (item.locId || "") === here;
  }).slice(0, 200).map(function (item) {
    if (item.kind === "image") {
      if (!shownOnScreen(item) || item.hidden) return null;
      const url = clip(item.url || item.icon, 500);
      if (!url) return null;
      return {
        id: clip(item.id, 80),
        name: clip(item.name, 80),
        x: unit(item.x),
        y: unit(item.y),
        kind: "image",
        url: url,
        tip: clip(item.tip, 400),
        pinSize: Math.min(480, Math.max(24, Number(item.pinSize) || 120))
      };
    }
    const personId = item.npcId || item.codexId || "";
    const npc = (item.kind === "npc" || item.kind === "foe") && personId
      ? npcs.find(function (row) { return row && row.id === personId; })
      : null;
    const hero = item.heroId && campaign && campaign.codex && Array.isArray(campaign.codex.heroes)
      ? campaign.codex.heroes.find(function (row) { return row && row.id === item.heroId; })
      : null;
    const npcFace = activeFace(npc);
    const fromHero = item.kind === "hero" && hero && hero.portrait;
    const face = {
      portrait: (fromHero ? hero.portrait : "") || item.portrait || (hero && hero.portrait) || npcFace.portrait || "",
      x: fromHero ? axis(hero.portraitX) : (item.portrait ? axis(item.portraitX) : npcFace.x),
      y: fromHero ? axis(hero.portraitY) : (item.portrait ? axis(item.portraitY) : npcFace.y),
      zoom: fromHero ? zoomOf(hero.portraitZoom) : (item.portrait ? zoomOf(item.portraitZoom) : npcFace.zoom)
    };
    const portrait = picture(face.portrait);
    const kind = item.kind === "npc" ? "npc" : (item.kind === "foe" ? "foe" : (item.kind === "hero" ? "hero" : "mark"));
    return Object.assign({
      id: clip(item.id, 80),
      name: clip(item.name, 240),
      x: unit(item.x),
      y: unit(item.y),
      kind: kind,
      toBattle: (kind === "mark" || kind === "foe") && item.toBattle === true,
      capTop: item.capTop === true,
      tip: clip(item.tip, 400),
      pinSize: Math.min(160, Math.max(12, Number(item.pinSize) || (portrait ? 56 : (item.kind === "mark" && (item.icon || item.emoji) ? 36 : 14)))),
      portrait: portrait,
      look: kind === "npc" && portrait && !(npc && npc.look === "token") && item.look !== "token" ? "full" : "",
      stand: kind === "npc" && portrait ? standOf(npc || item) : null,
      icon: kind === "mark" ? picture(item.icon) : "",
      emoji: kind === "mark" ? clip(item.emoji, 16) : "",
      portraitX: portrait ? face.x : 50,
      portraitY: portrait ? face.y : 50,
      portraitZoom: portrait ? face.zoom : 1
    }, textLook(item, 14));
  }).filter(Boolean);
  const labels = (Array.isArray(view.labels) ? view.labels : []).filter(function (item) {
    return item && (item.locId || "") === here;
  }).slice(0, 100).map(function (item) {
    return Object.assign({
      id: clip(item.id, 80),
      text: clip(item.text, 400),
      x: unit(item.x),
      y: unit(item.y)
    }, textLook(item, 28));
  });
  const talkMarker = view.talkId
    ? (Array.isArray(view.markers) ? view.markers : []).find(function (item) { return item && item.id === view.talkId && item.kind === "npc"; })
    : null;
  let talk = null;
  if (talkMarker && shownOnScreen(talkMarker) && !placeOff) {
    const npc = talkMarker.npcId ? npcs.find(function (row) { return row && row.id === talkMarker.npcId; }) : null;
    const lines = replicas(npc || talkMarker);
    const index = lines.length ? Math.min(lines.length - 1, Math.max(0, Number(talkMarker.talkLine) || 0)) : -1;
    const chosen = index >= 0 ? lines[index] : null;
    const fallback = !lines.length ? String((npc && npc.note) || talkMarker.tip || "").trim() : "";
    const face = activeFace(npc);
    const shop = !!talkMarker.shopOpen;
    const figure = standOf(npc || talkMarker, shop);
    const shopFont = Math.round(Number(campaign && campaign.shopFont) || 0);
    talk = {
      name: clip(talkMarker.name || (npc && npc.name) || "НПС", 80),
      line: clip(chosen ? (chosen.text || "...") : (fallback || "..."), 800),
      portrait: picture(face.portrait),
      figure: { x: figure.x, y: figure.y, h: figure.h },
      shop: shop,
      goods: shop ? saleRows(npc, campaign) : null,
      fontSize: shopFont >= 12 && shopFont <= 28 ? shopFont : 16,
      backdrop: clip((npc && npc.backdrop) || image, 300)
    };
  }
  const strokes = (Array.isArray(view.strokes) ? view.strokes : []).filter(function (item) {
    return item && (item.locId || "") === here;
  }).slice(-80).map(function (item) {
    const tool = item && (item.tool === "line" || item.tool === "rect" || item.tool === "ellipse") ? item.tool : "brush";
    return {
      tool: tool,
      color: clip(item && item.color, 20) || "#e6c36a",
      width: Math.min(40, Math.max(1, Number(item && item.width) || 3)),
      points: (item && Array.isArray(item.points) ? item.points : []).slice(0, 500).map(function (point) {
        return { x: unit(point.x), y: unit(point.y) };
      })
    };
  });
  const parentId = here ? ((locById(here) && locById(here).parentId) || "") : null;
  return {
    id: page.id,
    name: view.name || page.name || "Карта",
    kind: "map",
    up: parentId,
    day: clip(image, 300),
    night: "",
    mode: image ? "day" : (night ? "night" : "day"),
    tabs: [],
    locations: locations,
    markers: markers,
    labels: labels,
    strokes: strokes,
    talk: talk
  };
}

function projectNote(page) {
  return {
    id: page.id,
    name: page.name || "",
    kind: page.kind || "note",
    title: page.title || "",
    text: page.text || "",
    color: page.color || "#16130f",
    ink: page.ink || "#f3ead8",
    size: Number(page.size) || 64,
    font: page.font || "Georgia, serif",
    fontUrl: page.fontUrl || "",
    image: page.image || ""
  };
}

function hex(value, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "")) ? String(value) : fallback;
}

function picture(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.indexOf("data:image/") === 0) {
    return text.length > 900000 ? "" : text;
  }
  if (text.indexOf("..") >= 0) return "";
  if (text.charAt(0) === "/") return clip(text, 500);
  if (/^https?:\/\//i.test(text)) return clip(text, 800);
  return "";
}

function actorFace(campaign, actor) {
  if (!actor) return "";
  const own = picture(actor.portrait);
  if (own) return own;
  const heroes = campaign && campaign.codex && Array.isArray(campaign.codex.heroes) ? campaign.codex.heroes : [];
  if (actor.heroId) {
    const hero = heroes.find(function (row) { return row && row.id === actor.heroId; });
    if (hero) return picture(hero.portrait);
  }
  const npcs = campaign && campaign.codex && Array.isArray(campaign.codex.npcs) ? campaign.codex.npcs : [];
  if (actor.codexId) {
    const npc = npcs.find(function (row) { return row && row.id === actor.codexId; });
    if (npc) return picture(npc.portrait);
  }
  return "";
}

function placeImage(campaign) {
  const pages = Array.isArray(campaign.pages) ? campaign.pages : [];
  const map = pages.find(function (page) { return page && page.kind === "map" && page.id === campaign.activePageId; })
    || pages.find(function (page) { return page && page.kind === "map"; });
  if (!map) return "";
  const views = Array.isArray(map.views) ? map.views : [];
  const view = views.find(function (item) { return item && item.id === map.activeViewId; }) || views[0];
  if (!view) return "";
  const loc = view.focusId && (view.locations || []).find(function (item) { return item && item.id === view.focusId; });
  const sheet = loc || view;
  const night = sheet.mode === "night";
  return night ? (sheet.night || sheet.day || "") : (sheet.day || "");
}

function scaleOf(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(200, Math.max(20, Math.round(n)));
}

function projectBattle(campaign, battle) {
  const marks = {
    down: "Сбит",
    bleed: "Кровь",
    poison: "Яд",
    burn: "Горение",
    stun: "Оглушение",
    fear: "Страх",
    blind: "Слепота",
    deaf: "Глухота",
    hold: "Оковы",
    grab: "Захват",
    charm: "Очарование",
    focus: "Концентрация",
    exhaust: "Истощение",
    slow: "Замедление",
    vanish: "Невидимость",
    silence: "Тишина",
    paralysis: "Паралич",
    stone: "Окаменение"
  };
  const rows = (Array.isArray(battle.actors) ? battle.actors : []).map(function (actor, index) {
    return { actor: actor, index: index };
  }).filter(function (row) {
    return row.actor && String(row.actor.name || "").trim();
  }).sort(function (a, b) {
    const diff = (Number(b.actor.init) || 0) - (Number(a.actor.init) || 0);
    return diff || a.index - b.index;
  });
  const turn = rows.length ? ((Number(battle.turn) % rows.length) + rows.length) % rows.length : 0;
  return {
    kind: "battle",
    round: Math.max(1, Math.round(Number(battle.round) || 1)),
    bg: hex(battle.bg, "#14110e"),
    ink: hex(battle.ink, "#f3ead8"),
    player: hex(battle.player, "#7dcea0"),
    foe: hex(battle.foe, "#e07a6a"),
    brass: hex(battle.brass, "#e6c36a"),
    image: battle.image === "none" ? "" : (picture(battle.image) || picture(placeImage(campaign))),
    imageScale: scaleOf(battle.imageScale),
    imageX: axis(battle.imageX),
    imageY: axis(battle.imageY),
    log: clip((Array.isArray(battle.log) ? battle.log : []).slice(0, 12).join("\n"), 1200),
    actors: rows.slice(0, 40).map(function (row, index) {
      const actor = row.actor;
      const hpMax = Math.max(1, Math.round(Number(actor.hpMax) || 1));
      const hp = Math.max(0, Math.min(hpMax, Math.round(Number(actor.hp) || 0)));
      const tags = Array.isArray(actor.marks) ? actor.marks.filter(function (id) { return marks[id]; }) : [];
      return {
        id: clip(actor.id, 80),
        name: clip(actor.name, 80),
        side: actor.side === "player" ? "player" : "foe",
        init: Math.round(Number(actor.init) || 0),
        hp: hp,
        hpMax: hpMax,
        portrait: actorFace(campaign, actor),
        look: actor.look === "full" ? "full" : (actor.look === "token" ? "token" : ""),
        color: hex(actor.color, ""),
        dead: !!actor.dead || hp <= 0,
        boss: actor.boss === true ? true : actor.boss === false ? false : undefined,
        active: index === turn,
        marks: tags
      };
    })
  };
}

function playerSpot(page) {
  const views = Array.isArray(page.views) ? page.views : [];
  const view = views.find(function (item) { return item && item.id === page.activeViewId; }) || views[0] || null;
  if (!view) return null;
  const locations = Array.isArray(view.locations) ? view.locations : [];
  function locById(locId) {
    return locations.find(function (item) { return item && item.id === locId; });
  }
  function chainTrashed(locId) {
    let cursor = locId;
    let guard = 0;
    while (cursor && guard < 24) {
      const loc = locById(cursor);
      if (!loc || loc.trashed) return true;
      cursor = loc.parentId || "";
      guard += 1;
    }
    return false;
  }
  function shownOnScreen(item) {
    if (!item) return false;
    if (item.screen === false) return false;
    if (item.screen === true) return true;
    return !item.hidden;
  }
  let here = view.focusId || "";
  if (here && !locById(here)) here = "";
  let guard = 0;
  while (here && guard < 24) {
    const loc = locById(here);
    if (loc && shownOnScreen(loc) && !chainTrashed(here)) break;
    here = loc ? (loc.parentId || "") : "";
    guard += 1;
  }
  return { view: view, locById: locById, here: here };
}

export function playAction(campaign, op, rawId) {
  if (!campaign || typeof campaign !== "object") return null;
  const wanted = String(rawId || "").slice(0, 80);
  if (wanted && !/^[\w-]+$/.test(wanted)) return null;
  if (op === "enter") {
    const pages = Array.isArray(campaign.pages) ? campaign.pages : [];
    const page = pages.find(function (item) { return item && item.id === campaign.shownPageId && item.kind === "map"; });
    if (!page) return null;
    const spot = playerSpot(page);
    if (!spot) return null;
    if (wanted) {
      const loc = spot.locById(wanted);
      if (!loc) return null;
      const child = !loc.trashed && !loc.hidden && (loc.parentId || "") === spot.here;
      const parentId = spot.here ? ((spot.locById(spot.here) && spot.locById(spot.here).parentId) || "") : "";
      const back = !!spot.here && wanted === parentId;
      if (!child && !back) return null;
      spot.view.focusId = loc.id;
    } else {
      if (!spot.here) return null;
      const parentId = (spot.locById(spot.here) && spot.locById(spot.here).parentId) || "";
      if (parentId) return null;
      spot.view.focusId = "";
    }
    spot.view.talkId = "";
    return { op: "enter", id: spot.view.focusId || "" };
  }
  if (op === "fight") {
    const battle = campaign.battle;
    if (!battle || !Array.isArray(battle.actors)) return null;
    const named = battle.actors.some(function (actor) {
      return actor && String(actor.name || "").trim();
    });
    if (!named) return null;
    battle.screen = true;
    return { op: "fight", id: "" };
  }
  if (op === "turn") {
    const battle = campaign.battle;
    if (!battle || battle.screen === false || !Array.isArray(battle.actors)) return null;
    if (!wanted) return null;
    const rows = battle.actors.map(function (actor, index) {
      return { actor: actor, index: index };
    }).filter(function (row) {
      return row.actor && String(row.actor.name || "").trim();
    }).sort(function (a, b) {
      const diff = (Number(b.actor.init) || 0) - (Number(a.actor.init) || 0);
      return diff || a.index - b.index;
    });
    const at = rows.findIndex(function (row) { return row.actor.id === wanted; });
    if (at < 0) return null;
    battle.turn = at;
    return { op: "turn", id: wanted };
  }
  return null;
}

export function projectFrame(campaign) {
  const pages = Array.isArray(campaign.pages) ? campaign.pages : [];
  const page = pages.find(function (item) { return item.id === campaign.shownPageId; }) || pages[0] || null;
  const battle = campaign.battle;
  const fight = battle && battle.screen !== false && Array.isArray(battle.actors) && battle.actors.some(function (actor) {
    return actor && String(actor.name || "").trim();
  });
  return {
    stage: campaign.stage || { width: 1368, height: 786 },
    page: fight ? projectBattle(campaign, battle) : (page ? (page.kind === "map" ? projectMap(page, campaign) : projectNote(page)) : null),
    at: Date.now()
  };
}

export function campaignOk(value) {
  if (!value || typeof value !== "object") return false;
  if (!value.stage || !Array.isArray(value.pages) || !value.pages.length) return false;
  if (!value.pages.every(function (page) { return page && typeof page.id === "string"; })) return false;
  return true;
}
