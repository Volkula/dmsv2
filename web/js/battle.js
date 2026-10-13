(function () {
  const MARKS = [
    ["down", "Сбит"],
    ["bleed", "Кровь"],
    ["poison", "Яд"],
    ["burn", "Горение"],
    ["stun", "Оглушение"],
    ["fear", "Страх"],
    ["blind", "Слепота"],
    ["deaf", "Глухота"],
    ["hold", "Оковы"],
    ["grab", "Захват"],
    ["charm", "Очарование"],
    ["focus", "Концентрация"],
    ["exhaust", "Истощение"],
    ["slow", "Замедление"],
    ["vanish", "Невидимость"],
    ["silence", "Тишина"],
    ["paralysis", "Паралич"],
    ["stone", "Окаменение"]
  ];

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formula(text) {
    const raw = String(text || "").toLowerCase().replace(/к/g, "d").replace(/\s/g, "");
    const found = raw.match(/(\d*)d(\d+)([+-]\d+)?/);
    const sidesOk = [4, 6, 8, 10, 12, 20, 100];
    if (!found) return { count: 1, sides: 6, bonus: 0 };
    const sides = sidesOk.indexOf(Number(found[2])) >= 0 ? Number(found[2]) : 6;
    return {
      count: Math.min(12, Math.max(1, Number(found[1] || 1))),
      sides: sides,
      bonus: Number(found[3] || 0)
    };
  }

  function leading(text) {
    const match = String(text || "").match(/(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function monsterImg(monster) {
    const match = String(monster && monster.name || "").match(/\(([^)]+)\)\s*$/);
    if (!match) return "";
    const file = match[1].toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/ +/g, "_") + ".jpg";
    return "/catalog/img/monsters/" + encodeURIComponent(file);
  }

  function inkOk(value) {
    return /^#[0-9a-fA-F]{6}$/.test(String(value || ""));
  }

  const FOE_INKS = [
    "#e4533e", "#e07a2f", "#e6b325", "#8fce4a",
    "#2fbf71", "#2bb5c0", "#3d8bfd", "#7a6ff0",
    "#c46bdb", "#e25c9a", "#c47a4a", "#6f8f3a"
  ];

  function hslHex(hue, sat, light) {
    const s = sat / 100;
    const l = light / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (hue < 60) { r = c; g = x; }
    else if (hue < 120) { r = x; g = c; }
    else if (hue < 180) { g = c; b = x; }
    else if (hue < 240) { g = x; b = c; }
    else if (hue < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const part = function (n) { return Math.round((n + m) * 255).toString(16).padStart(2, "0"); };
    return "#" + part(r) + part(g) + part(b);
  }

  function assignInks(battle) {
    const used = {};
    (battle.actors || []).forEach(function (actor) {
      if (actor && actor.side !== "player" && inkOk(actor.color)) used[actor.color.toLowerCase()] = true;
    });
    let cursor = 0;
    (battle.actors || []).forEach(function (actor) {
      if (!actor || actor.side === "player" || inkOk(actor.color)) return;
      let color = "";
      for (let n = 0; n < FOE_INKS.length; n++) {
        const candidate = FOE_INKS[(cursor + n) % FOE_INKS.length];
        if (!used[candidate.toLowerCase()]) {
          color = candidate;
          cursor = (cursor + n + 1) % FOE_INKS.length;
          break;
        }
      }
      if (!color) {
        color = hslHex((cursor * 47) % 360, 64, 48);
        cursor++;
      }
      actor.color = color;
      used[color.toLowerCase()] = true;
    });
  }

  function frameStyle(actor) {
    if (!inkOk(actor && actor.color)) return "";
    return ' style="border-color:' + esc(actor.color) + '"';
  }

  function ensure(campaign) {
    const prev = campaign.battle || {};
    if (!campaign.battle || !Array.isArray(campaign.battle.actors)) campaign.battle = prev;
    const battle = campaign.battle;
    if (!battle.bg) battle.bg = "#14110e";
    if (!battle.ink) battle.ink = "#f3ead8";
    if (!battle.player) battle.player = "#7dcea0";
    if (!battle.foe) battle.foe = "#e07a6a";
    if (!battle.brass) battle.brass = "#e6c36a";
    if (battle.image == null) battle.image = "";
    if (!Number.isFinite(Number(battle.imageScale)) || Number(battle.imageScale) <= 0) battle.imageScale = 100;
    if (!Number.isFinite(Number(battle.imageX))) battle.imageX = 50;
    if (!Number.isFinite(Number(battle.imageY))) battle.imageY = 50;
    if (battle.autoSort == null) battle.autoSort = false;
    if (battle.screen == null) battle.screen = true;
    if (!Number.isFinite(Number(battle.round)) || Number(battle.round) < 1) battle.round = 1;
    if (!Number.isFinite(Number(battle.turn))) battle.turn = 0;
    battle.actors = Array.isArray(battle.actors) ? battle.actors : [];
    battle.log = Array.isArray(battle.log) ? battle.log : [];
    battle.actors.forEach(armsOf);
    seedBoard(campaign, battle);
    assignInks(battle);
    return battle;
  }

  function armsOf(actor) {
    if (!actor) return [];
    if (!Array.isArray(actor.weapons)) actor.weapons = [];
    if (!actor.weapons.length) {
      actor.weapons.push({
        id: crypto.randomUUID(),
        name: actor.weapon || "Атака",
        damage: actor.damage || "1d6",
        bonus: Number(actor.bonus) || 0
      });
    }
    actor.weapons.forEach(function (arm) {
      if (!arm.id) arm.id = crypto.randomUUID();
      if (arm.name == null) arm.name = "Атака";
      if (arm.damage == null) arm.damage = actor.damage || "1d6";
      if (!Number.isFinite(Number(arm.bonus))) arm.bonus = Number(actor.bonus) || 0;
    });
    return actor.weapons;
  }

  function useArm(actor, arm) {
    if (!actor || !arm) return;
    actor.weapon = arm.name || "";
    actor.damage = arm.damage || "1d6";
    actor.bonus = Math.round(Number(arm.bonus) || 0);
  }

  function seedBoard(campaign, battle) {
    const known = {};
    battle.actors.forEach(function (actor) { known[actor.id] = true; });
    if (!Array.isArray(battle.board)) battle.board = [];
    battle.board = battle.board.filter(function (group) { return group && (group.kind === "sep" || group.kind === "squad"); });
    battle.board.forEach(function (group) {
      if (!group.id) group.id = crypto.randomUUID();
      if (group.kind !== "sep") {
        group.kind = "squad";
        group.memberIds = (group.memberIds || []).filter(function (id) { return known[id]; });
      }
    });
    if (!battle.board.length && battle.actors.length) {
      const players = battle.actors.filter(function (actor) { return actor.side === "player"; });
      const foes = battle.actors.filter(function (actor) { return actor.side !== "player"; });
      if (players.length) {
        battle.board.push({
          id: crypto.randomUUID(),
          kind: "squad",
          name: "Герои",
          memberIds: players.map(function (actor) { return actor.id; })
        });
      }
      const squads = (campaign.codex && campaign.codex.squads) || [];
      const used = {};
      squads.forEach(function (squad) {
        const ids = foes.filter(function (actor) {
          return actor.codexId && (squad.memberIds || []).indexOf(actor.codexId) >= 0;
        }).map(function (actor) { return actor.id; });
        if (!ids.length) return;
        ids.forEach(function (id) { used[id] = true; });
        battle.board.push({
          id: crypto.randomUUID(),
          kind: "squad",
          name: squad.name || "Отряд",
          memberIds: ids,
          codexSquadId: squad.id
        });
      });
      foes.forEach(function (actor) {
        if (used[actor.id]) return;
        battle.board.push({
          id: crypto.randomUUID(),
          kind: "squad",
          name: actor.name || "Отряд",
          memberIds: [actor.id]
        });
      });
    }
    const placed = {};
    battle.board.forEach(function (group) {
      (group.memberIds || []).forEach(function (id) { placed[id] = true; });
    });
    battle.actors.forEach(function (actor) {
      if (placed[actor.id]) return;
      battle.board.push({
        id: crypto.randomUUID(),
        kind: "squad",
        name: actor.side === "player" ? "Герои" : (actor.name || "Отряд"),
        memberIds: [actor.id]
      });
    });
  }

  function markName(id) {
    const found = MARKS.find(function (item) { return item[0] === id; });
    return found ? found[1] : "";
  }

  const MARK_SVG = {
    down: '<path d="M4 16h16M7 12h10M10 8h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    bleed: '<path d="M12 3s6 6.2 6 10a6 6 0 11-12 0c0-3.8 6-10 6-10z" fill="currentColor"/>',
    poison: '<circle cx="12" cy="14" r="5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 9h4M12 9V4M9 6h6" fill="none" stroke="currentColor" stroke-width="2"/>',
    burn: '<path d="M12 3s4 4 4 7a4 4 0 11-8 0c0-1.2.6-2.2 1.2-3C8 9 9 11 12 11c0-3 0-5 0-8z" fill="currentColor"/>',
    stun: '<path d="M12 3l1.6 4.6H18l-3.8 2.8 1.5 4.6L12 12.4 8.3 15l1.5-4.6L6 7.6h4.4z" fill="currentColor"/>',
    fear: '<path d="M12 4l8 14H4z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9v4M12 16.2h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    blind: '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 19L19 5" stroke="currentColor" stroke-width="2"/>',
    deaf: '<path d="M8 10a4 4 0 018 0c0 3-2 4-3 6h-2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 19L19 5" stroke="currentColor" stroke-width="2"/>',
    hold: '<circle cx="8" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>',
    grab: '<path d="M8 11V7a2 2 0 114 0v4M12 11V6a2 2 0 114 0v6M16 12V8a2 2 0 114 0v6c0 4-3 6-8 6s-8-3-8-7v-3a2 2 0 114 0v3" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    charm: '<path d="M12 19s-7-4.2-7-9a4 4 0 017-2 4 4 0 017 2c0 4.8-7 9-7 9z" fill="currentColor"/>',
    focus: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="2"/>',
    exhaust: '<path d="M7 15h6M8 18h4M9 8a3 3 0 016 0c0 2-3 3-3 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    slow: '<circle cx="12" cy="13" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 13V9M12 6V4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    vanish: '<path d="M4 16c2-4 4-6 8-6s6 2 8 6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10h.01M16 10h.01M6 18L18 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    silence: '<path d="M8 10a4 4 0 018 0v2c0 2-1 3-2 4h-4c-1-1-2-2-2-4z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 19L19 5" stroke="currentColor" stroke-width="2"/>',
    paralysis: '<path d="M13 3L6 13h5l-1 8 8-12h-5z" fill="currentColor"/>',
    stone: '<path d="M12 3l7 4v8l-7 4-7-4V7z" fill="none" stroke="currentColor" stroke-width="2"/>'
  };

  const SIDE_SVG = {
    player: '<path d="M12 2.2l7.2 2.6v6.2c0 4.6-3.1 8-7.2 9.8-4.1-1.8-7.2-5.2-7.2-9.8V4.8L12 2.2z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.2v7.2M9.2 9.6h5.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    foe: '<path d="M12 3.2a6.2 6.2 0 00-6.2 6.2c0 2.2 1.1 3.8 2.2 4.9V18h2.2v2.2h1.6V18h.4v2.2H14V18h2.2v-3.7c1.1-1.1 2.2-2.7 2.2-4.9A6.2 6.2 0 0012 3.2z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="9.4" cy="9.6" r="1.15" fill="currentColor"/><circle cx="14.6" cy="9.6" r="1.15" fill="currentColor"/><path d="M10.2 13.5c.5.7 1.1 1 1.8 1s1.3-.3 1.8-1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'
  };

  function sideIcon(side) {
    const draw = side === "player" ? SIDE_SVG.player : SIDE_SVG.foe;
    return '<span class="letter side-glyph"><svg viewBox="0 0 24 24" aria-hidden="true">' + draw + "</svg></span>";
  }

  function hpColor(pct) {
    const hue = Math.round(Math.max(0, Math.min(100, pct)) * 1.2);
    return "hsl(" + hue + ", 64%, 42%)";
  }

  function hpMeter(hp, max) {
    const pct = max ? Math.round(hp / max * 100) : 0;
    return '<span class="hp-meter"><i style="width:' + pct + "%;background:" + hpColor(pct) + '"></i></span>';
  }

  function markIcons(marks) {
    const list = (marks || []).map(function (id) {
      const draw = MARK_SVG[id];
      if (!draw) return "";
      return '<span class="mark-ico" title="' + esc(markName(id) || id) + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + draw + "</svg></span>";
    }).filter(Boolean);
    if (!list.length) return "";
    return '<span class="mark-stack' + (list.length > 1 ? " is-many" : "") + '">' + list.join("") + "</span>";
  }

  function markUnder(marks) {
    const list = (marks || []).map(function (id) {
      const draw = MARK_SVG[id];
      const name = markName(id);
      if (!draw || !name) return "";
      return '<span class="mark-line"><svg viewBox="0 0 24 24" aria-hidden="true">' + draw + "</svg><em>" + esc(name) + "</em></span>";
    }).filter(Boolean);
    if (!list.length) return "";
    return '<span class="mark-under">' + list.join("") + "</span>";
  }

  function order(battle) {
    return battle.actors.map(function (actor, index) { return { actor: actor, index: index }; }).sort(function (a, b) {
      const diff = (Number(b.actor.init) || 0) - (Number(a.actor.init) || 0);
      return diff || a.index - b.index;
    });
  }

  function blank(side) {
    return {
      id: crypto.randomUUID(),
      name: side === "player" ? "Герой" : "Враг",
      side: side,
      init: 0,
      hp: side === "player" ? 38 : 11,
      hpMax: side === "player" ? 38 : 11,
      ac: side === "player" ? 16 : 12,
      weapon: side === "player" ? "Атака" : "Скимитар",
      damage: side === "player" ? "1d8+3" : "1d6+1",
      bonus: side === "player" ? 6 : 3,
      initBonus: side === "player" ? 2 : 1,
      portrait: "",
      note: "",
      marks: [],
      dead: false,
      markerId: ""
    };
  }

  function fromMonster(monster) {
    const attack = (monster.action || [])[0] || {};
    const bits = String(attack.attack || "").split("|");
    const hp = leading(monster.hp) || 1;
    const actor = blank("foe");
    actor.name = String(monster.name || "Враг").replace(/\s*\([^)]*\)\s*$/, "").trim() || "Враг";
    actor.hp = hp;
    actor.hpMax = hp;
    actor.ac = leading(monster.ac) || 10;
    actor.weapon = attack.name || "Атака";
    actor.damage = bits[2] || "1d6";
    actor.bonus = Number(bits[1]) || 0;
    actor.initBonus = Math.floor(((Number(monster.dex) || 10) - 10) / 2);
    actor.portrait = monsterImg(monster);
    actor.note = String(monster.cr ? "Оп " + monster.cr : "");
    return actor;
  }

  function mount(host, ctx) {
    if (host._battleOff) host._battleOff();
    const battle = ensure(ctx.campaign);
    let query = "";
    let hits = [];
    let alive = true;
    let custom = { name: "Огр", hp: 59, ac: 11, bonus: 6, damage: "2d8+4", weapon: "Дубина", count: 1 };

    function save() { if (ctx.save) ctx.save(); }

    function rows() { return order(battle); }

    function active() {
      const list = rows();
      if (!list.length) return null;
      const at = ((Number(battle.turn) % list.length) + list.length) % list.length;
      battle.turn = at;
      return list[at].actor;
    }

    function selectActor(actor) {
      const list = rows();
      const at = list.findIndex(function (row) { return row.actor.id === actor.id; });
      if (at >= 0) battle.turn = at;
    }

    function findMarker(id) {
      let found = null;
      (ctx.campaign.pages || []).forEach(function (page) {
        (page.views || []).forEach(function (view) {
          (view.markers || []).forEach(function (row) { if (row.id === id) found = row; });
          (view.locations || []).forEach(function (loc) {
            (loc.markers || []).forEach(function (row) { if (row.id === id) found = row; });
          });
        });
      });
      return found;
    }

    function pushMarker(actor) {
      if (!actor || !actor.markerId) return;
      const marker = findMarker(actor.markerId);
      if (!marker) return;
      marker.name = actor.name;
      marker.hp = actor.hp;
      marker.hpMax = actor.hpMax;
      marker.ac = actor.ac;
      marker.weapon = actor.weapon;
      marker.damage = actor.damage;
      marker.bonus = actor.bonus;
      marker.portrait = actor.portrait || marker.portrait;
      marker.hidden = marker.hidden !== false;
      if (marker.screen == null) marker.screen = false;
    }

    function note(text) {
      battle.log.unshift(text);
      battle.log = battle.log.slice(0, 24);
    }

    function setHp(actor, value) {
      actor.hp = Math.max(0, Math.min(actor.hpMax || 999, Math.round(value)));
      actor.dead = actor.hp <= 0;
      pushMarker(actor);
    }

    function roll(spec) {
      if (!ctx.roll) return Promise.resolve();
      return ctx.roll(spec).then(function (data) {
        const total = data && data.event && data.event.roll ? data.event.roll.total : null;
        if (total != null) note((spec.name || "Бросок") + (spec.label ? " · " + spec.label : "") + ": " + total);
        save();
        paint();
        return data;
      });
    }

    function attack(actor) {
      const foe = currentFoe(actor);
      roll({
        name: actor.name || "Боец",
        label: (actor.weapon || "Атака") + (foe ? " по " + (foe.name || "цели") : ""),
        count: 1,
        sides: 20,
        bonus: Number(actor.bonus) || 0
      });
    }

    function damage(actor, apply) {
      const foe = apply ? currentFoe(actor) : null;
      const spec = formula(actor.damage || "1d6");
      roll({
        name: actor.name || "Боец",
        label: "урон" + (foe ? " по " + (foe.name || "цели") : ""),
        count: spec.count,
        sides: spec.sides,
        bonus: spec.bonus
      }).then(function (data) {
        const total = data && data.event && data.event.roll ? Number(data.event.roll.total) : 0;
        actor.lastDamage = total;
        if (apply && total && foe) {
          setHp(foe, (Number(foe.hp) || 0) - total);
          note((actor.name || "Боец") + " бьёт " + (foe.name || "цель") + " на " + total);
        }
        save();
        paint();
      });
    }

    function currentFoe(from) {
      if (from && from.targetId) {
        const picked = battle.actors.find(function (row) { return row.id === from.targetId && !row.dead; });
        if (picked) return picked;
      }
      const list = rows();
      const start = list.findIndex(function (row) { return row.actor.id === (from && from.id); });
      for (let step = 1; step <= list.length; step++) {
        const row = list[(Math.max(0, start) + step) % list.length];
        if (row && row.actor.side !== (from && from.side) && !row.actor.dead) return row.actor;
      }
      return null;
    }

    function step(dir) {
      const list = rows();
      if (!list.length) return;
      let at = battle.turn;
      for (let n = 0; n < list.length; n++) {
        at = (at + dir + list.length) % list.length;
        if (dir > 0 && at === 0) battle.round = (Number(battle.round) || 1) + 1;
        if (!list[at].actor.dead) break;
      }
      battle.turn = at;
      save();
      paint();
    }

    function addCopies(sample, count) {
      const total = Math.min(12, Math.max(1, Number(count) || 1));
      for (let i = 0; i < total; i++) {
        const actor = Object.assign({}, sample, {
          id: crypto.randomUUID(),
          marks: [],
          markerId: "",
          name: total > 1 ? sample.name + " " + (i + 1) : sample.name
        });
        battle.actors.push(actor);
      }
      save();
      paint();
    }

    function loadMonsters() {
      if (window.allMonsters) return Promise.resolve();
      return new Promise(function (resolve) {
        const node = document.createElement("script");
        node.src = "/catalog/monsters.js";
        node.onload = function () { resolve(); };
        node.onerror = function () { resolve(); };
        document.head.appendChild(node);
      });
    }

    function search(text) {
      query = text;
      const q = text.trim().toLowerCase();
      const box = document.querySelector("#battle-pop .monster-hits");
      if (!box) return;
      if (q.length < 2 || !window.allMonsters) {
        hits = [];
        box.hidden = true;
        box.innerHTML = "";
        return;
      }
      hits = window.allMonsters.filter(function (row) {
        return String(row.name || "").toLowerCase().indexOf(q) >= 0;
      }).slice(0, 8);
      box.hidden = !hits.length;
      box.innerHTML = hits.map(function (row, index) {
        return '<button type="button" data-monster="' + index + '">' + esc(String(row.name || "").replace(/\s*\([^)]*\)\s*$/, "")) + "</button>";
      }).join("");
    }

    const WHEEL = [
      ["fighter", "Добавить бойца в отряд", "Боец"],
      ["sep", "Добавить разделитель", "Черта"],
      ["squad", "Добавить отряд из справочника", "Отряд"]
    ];
    let insertAt = battle.board.length;
    let wheel = null;
    let pop = null;
    let popActorId = "";
    let itemHits = [];
    let draft = { portrait: "", note: "" };
    let openId = "";
    let popX = 80;
    let popY = 80;

    function book() {
      if (!window.ShirmoCodex) return ctx.campaign.codex || { npcs: [], squads: [] };
      return window.ShirmoCodex.ensure(ctx.campaign);
    }

    function remember(actor, squadName, codexSquadId) {
      const shelf = book();
      shelf.npcs = shelf.npcs || [];
      shelf.squads = shelf.squads || [];
      let person = actor.codexId && shelf.npcs.find(function (row) { return row.id === actor.codexId; });
      if (!person) {
        person = {
          id: crypto.randomUUID(),
          role: actor.side === "player" ? "npc" : "enemy",
          name: actor.name || "",
          note: actor.note || "",
          weapon: actor.weapon || "",
          damage: actor.damage || "",
          hp: actor.hpMax || actor.hp || 0,
          hpMax: actor.hpMax || actor.hp || 0,
          ac: actor.ac || 0,
          bonus: actor.bonus || 0,
          portrait: actor.portrait || ""
        };
        shelf.npcs.push(person);
        actor.codexId = person.id;
      } else {
        person.name = actor.name || person.name;
        person.weapon = actor.weapon || person.weapon;
        person.damage = actor.damage || person.damage;
        if (actor.portrait) person.portrait = actor.portrait;
      }
      if (actor.side === "player") return null;
      let squad = codexSquadId && shelf.squads.find(function (row) { return row.id === codexSquadId; });
      if (!squad && squadName) squad = shelf.squads.find(function (row) { return row.name === squadName; });
      if (!squad) {
        squad = { id: crypto.randomUUID(), name: squadName || actor.name || "Отряд", placeId: "", memberIds: [] };
        shelf.squads.push(squad);
      }
      squad.memberIds = squad.memberIds || [];
      if (squad.memberIds.indexOf(person.id) < 0) squad.memberIds.push(person.id);
      return squad;
    }

    function closeWheel() {
      if (wheel && wheel.el) wheel.el.remove();
      wheel = null;
    }

    function closePop() {
      if (pop) pop.remove();
      pop = null;
      popActorId = "";
    }

    function wheelIndex(x, y) {
      if (!wheel) return -1;
      const dx = x - wheel.x;
      const dy = y - wheel.y;
      if (Math.hypot(dx, dy) < 46) return -1;
      const step = (Math.PI * 2) / WHEEL.length;
      const rel = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
      return Math.round(rel / step) % WHEEL.length;
    }

    function paintWheel() {
      if (!wheel) return;
      const name = wheel.el.querySelector(".wheel-name");
      wheel.el.querySelectorAll("button").forEach(function (button, index) {
        button.classList.toggle("is-hot", index === wheel.index);
      });
      if (name) name.textContent = wheel.index >= 0 ? WHEEL[wheel.index][1] : "";
    }

    function openWheel(x, y) {
      closeWheel();
      closePop();
      const el = document.createElement("div");
      el.id = "battle-wheel";
      el.className = "tool-wheel is-words";
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.innerHTML = '<span class="wheel-name"></span>' + WHEEL.map(function (item, index) {
        const deg = index * (360 / WHEEL.length);
        return '<button type="button" style="--a:' + deg + 'deg" title="' + esc(item[1]) + '">' + esc(item[2]) + "</button>";
      }).join("");
      document.body.appendChild(el);
      wheel = { x: x, y: y, el: el, index: -1 };
      el.addEventListener("click", function (event) {
        const button = event.target.closest("button");
        if (!button || !wheel) return;
        const index = Array.prototype.indexOf.call(el.querySelectorAll("button"), button);
        runWheel(index);
      });
    }

    function runWheel(index) {
      const item = index >= 0 ? WHEEL[index] : null;
      closeWheel();
      if (!item) return;
      if (item[0] === "fighter") openAdd();
      else if (item[0] === "sep") openSep();
      else openCodexSquads();
    }

    function openPop(title, body) {
      closePop();
      const el = document.createElement("div");
      el.id = "battle-pop";
      el.className = "battle-pop";
      el.innerHTML = "<h3>" + esc(title) + "</h3>" + body + '<button type="button" data-act="pop-close">Закрыть</button>';
      el.style.visibility = "hidden";
      el.style.maxHeight = Math.max(160, window.innerHeight - 16) + "px";
      document.body.appendChild(el);
      const pad = 8;
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      let left = popX;
      let top = popY;
      if (left + width > window.innerWidth - pad) left = popX - width;
      if (left + width > window.innerWidth - pad) left = window.innerWidth - pad - width;
      if (left < pad) left = pad;
      if (top + height > window.innerHeight - pad) top = window.innerHeight - pad - height;
      if (top < pad) top = pad;
      el.style.left = left + "px";
      el.style.top = top + "px";
      el.style.visibility = "";
      pop = el;
      el.addEventListener("click", onPopClick);
      el.addEventListener("input", onPopInput);
    }

    function toneHtml() {
      const images = (ctx.library && ctx.library().images) || [];
      const options = '<option value="">Фон локации</option><option value="none"' + (battle.image === "none" ? " selected" : "") + ">Без картинки</option>" + images.map(function (image) {
        return '<option value="' + esc(image.url) + '"' + (image.url === battle.image ? " selected" : "") + ">" + esc(image.name || "Картинка") + "</option>";
      }).join("");
      return '<details class="drop battle-tone"><summary>Экран игроков</summary>' +
        '<div class="tone-colors">' +
        '<label>Фон<input id="battle-bg" type="color" value="' + esc(battle.bg) + '"></label>' +
        '<label>Текст<input id="battle-ink" type="color" value="' + esc(battle.ink) + '"></label>' +
        '<label>Герои<input id="battle-player" type="color" value="' + esc(battle.player) + '"></label>' +
        '<label>Враги<input id="battle-foe" type="color" value="' + esc(battle.foe) + '"></label>' +
        '<label>Активный<input id="battle-brass" type="color" value="' + esc(battle.brass) + '"></label></div>' +
        '<label>Из библиотеки<select id="battle-image">' + options + "</select></label>" +
        '<label class="battle-upload" title="Свой фон. Картинка попадёт в библиотеку">Загрузить фон<input id="battle-file" type="file" accept="image/*" aria-label="Загрузить фон"></label>' +
        '<details class="drop"><summary>Размер и смещение</summary>' +
        '<label>Размер <b>' + esc(String(battle.imageScale || 100)) + '%</b><input id="battle-scale" type="range" min="20" max="200" value="' + esc(String(battle.imageScale || 100)) + '"></label>' +
        '<label>По горизонтали <b>' + esc(String(battle.imageX == null ? 50 : battle.imageX)) + '</b><input id="battle-x" type="range" min="0" max="100" value="' + esc(String(battle.imageX == null ? 50 : battle.imageX)) + '"></label>' +
        '<label>По вертикали <b>' + esc(String(battle.imageY == null ? 50 : battle.imageY)) + '</b><input id="battle-y" type="range" min="0" max="100" value="' + esc(String(battle.imageY == null ? 50 : battle.imageY)) + '"></label>' +
        "</details></details>";
    }

    function initOf(id) {
      const actor = battle.actors.find(function (row) { return row.id === id; });
      return Number(actor && actor.init) || 0;
    }

    function sortBoard() {
      const chunks = [];
      let current = [];
      battle.board.forEach(function (group) {
        if (group && group.kind === "sep") {
          chunks.push(current);
          chunks.push(group);
          current = [];
        } else if (group) current.push(group);
      });
      chunks.push(current);
      const next = [];
      chunks.forEach(function (chunk) {
        if (!Array.isArray(chunk)) {
          next.push(chunk);
          return;
        }
        chunk.forEach(function (group) {
          const order = {};
          (group.memberIds || []).forEach(function (id, index) { order[id] = index; });
          group.memberIds = (group.memberIds || []).slice().sort(function (a, b) {
            return initOf(b) - initOf(a) || order[a] - order[b];
          });
        });
        const rank = {};
        chunk.forEach(function (group, index) { rank[group.id] = index; });
        chunk.sort(function (a, b) {
          const topA = a.memberIds && a.memberIds.length ? initOf(a.memberIds[0]) : -999;
          const topB = b.memberIds && b.memberIds.length ? initOf(b.memberIds[0]) : -999;
          return topB - topA || rank[a.id] - rank[b.id];
        });
        chunk.forEach(function (group) { next.push(group); });
      });
      battle.board = next;
    }

    function toolsHtml(now) {
      return '<div class="queue-tools"><div class="tool-side">' +
        '<button type="button" data-act="prev" title="Предыдущий живой ход">Назад</button>' +
        '<button type="button" data-act="next" title="Следующий живой ход">Дальше</button>' +
        '<span class="turn-name">' + esc(now ? now.name : "Нет хода") + "</span></div>" +
        '<div class="round-bar"><button type="button" data-act="round-down" title="Предыдущий раунд">−</button>' +
        '<input id="battle-round" class="round-num" type="number" min="1" value="' + esc(String(battle.round || 1)) + '" aria-label="Раунд">' +
        '<button type="button" data-act="round-up" title="Следующий раунд">+</button>' +
        '<span class="round-word">раунд</span></div>' +
        '<div class="tool-side tool-end">' +
        '<button type="button" data-act="quick-attack" title="Кто атакует и чем. Если оружия нет — бросок кости с подписью «атака»">Атаковать</button>' +
        '<label class="check" title="Пока включено, игроки видят бой вместо карты"><input id="battle-screen" type="checkbox"' + (battle.screen !== false ? " checked" : "") + "> Игрокам</label>" +
        '<button type="button" data-act="sort" class="' + (battle.autoSort ? "is-on" : "") + '" title="Большее число выше. Внутри отряда и между отрядами. Разделители остаются на месте">По числу</button>' +
        '<button type="button" data-act="init" title="Бросить инициативу всем на ширме, без показа кубиков">Инициатива всем</button>' +
        '<button type="button" data-act="place" title="Поставить врагов на текущую карту. Игроки их не видят, пока не снимете скрытие">На карту</button></div></div>' +
        '<p class="note">«Атаковать» — кто бьёт и чем. Средняя кнопка — боец, черта или отряд. Правая по бойцу — статус и убить. к20 — инициатива этого бойца.</p>' +
        toneHtml();
    }

    function actorInk(actor) {
      if (inkOk(actor.color)) return actor.color;
      return actor.side === "player" ? (battle.player || "#7dcea0") : (battle.foe || "#e4533e");
    }

    function inkField(actor) {
      const current = actorInk(actor);
      const dots = FOE_INKS.map(function (color) {
        const on = inkOk(actor.color) && actor.color.toLowerCase() === color.toLowerCase() ? " is-on" : "";
        return '<button type="button" class="ink-dot' + on + '" data-ink="' + color + '" data-id="' + esc(actor.id) + '" style="background:' + color + '" title="' + color + '"></button>';
      }).join("");
      return '<div class="ink-field"><span>Цвет</span><div class="ink-picks">' + dots +
        '<input data-q="color" data-id="' + esc(actor.id) + '" type="color" value="' + esc(current) + '" aria-label="Свой цвет" title="Свой цвет"></div></div>';
    }

    function faceBox(actor) {
      const face = actor.portrait
        ? '<img alt="" src="' + esc(actor.portrait) + '">'
        : sideIcon(actor.side);
      return '<label class="fight-face" style="--ink:' + esc(actorInk(actor)) + '" title="Загрузить портрет. Картинка попадёт в библиотеку">' + face + markIcons(actor.marks) +
        '<input type="file" accept="image/*" data-face="' + esc(actor.id) + '" aria-label="Портрет ' + esc(actor.name || "") + '"></label>';
    }

    function fighterRow(actor, now, groupId) {
      const max = Math.max(1, Math.round(Number(actor.hpMax) || 1));
      const hp = Math.max(0, Math.min(max, Math.round(Number(actor.hp) || 0)));
      const open = openId === actor.id;
      const main = '<tr class="' + (now && actor.id === now.id ? "is-on" : "") + (actor.dead ? " is-dead" : "") + '" data-fighter="' + esc(actor.id) + '" data-board="' + esc(groupId) + '">' +
        '<td><button type="button" data-act="row-attack" data-id="' + esc(actor.id) + '" title="Атака этого бойца">Атака</button></td>' +
        "<td>" + faceBox(actor) + "</td>" +
        '<td class="init-cell"><input data-q="init" data-id="' + esc(actor.id) + '" class="num" type="number" value="' + esc(String(actor.init || 0)) + '" aria-label="Инициатива">' +
        '<button type="button" data-act="roll-init" data-id="' + esc(actor.id) + '" title="Бросок инициативы. Игроки видят кубик">к20</button></td>' +
        '<td><input data-q="name" data-id="' + esc(actor.id) + '" type="text" value="' + esc(actor.name || "") + '" aria-label="Имя"></td>' +
        '<td class="hp-cell"><span class="hp-stack">' + hpMeter(hp, max) +
        '<input data-q="hp" data-id="' + esc(actor.id) + '" type="range" min="0" max="' + max + '" value="' + hp + '" aria-label="Хиты"></span><b class="hp-read">' + hp + "</b></td>" +
        '<td><button type="button" data-fold="' + esc(actor.id) + '" title="Параметры">' + (open ? "▴" : "▾") + "</button></td>" +
        '<td><button type="button" data-go="' + esc(actor.id) + '" title="Сделать ход этого бойца">ход</button></td>' +
        '<td><button type="button" data-act="life" data-id="' + esc(actor.id) + '">' + (actor.dead ? "Оживить" : "Убить") + "</button></td></tr>";
      const more = '<tr class="fighter-more" data-more="' + esc(actor.id) + '"' + (open ? "" : " hidden") + '><td colspan="8"><div class="more-grid">' +
        '<label>Макс.<input data-q="hpMax" data-id="' + esc(actor.id) + '" class="num" type="number" min="1" value="' + max + '" aria-label="Максимум хитов"></label>' +
        '<label>КД<input data-q="ac" data-id="' + esc(actor.id) + '" class="num" type="number" min="0" value="' + esc(String(actor.ac || 0)) + '" aria-label="Класс доспеха"></label>' +
        '<label class="check">Полоса<input data-q="boss" data-id="' + esc(actor.id) + '" type="checkbox"' + (isBoss(actor) ? " checked" : "") + (actor.side === "player" ? " disabled" : "") + ' aria-label="Полоса хитов" title="Полоса хитов на экране игроков"></label>' +
        '<label>Оружие<input data-q="weapon" data-id="' + esc(actor.id) + '" type="text" value="' + esc(actor.weapon || "") + '" aria-label="Оружие"></label>' +
        '<label>Урон<input data-q="damage" data-id="' + esc(actor.id) + '" type="text" value="' + esc(actor.damage || "") + '" aria-label="Урон"></label>' +
        inkField(actor) +
        "</div></td></tr>";
      return main + more;
    }

    function sheetHtml(now) {
      const rowsHtml = battle.board.map(function (group) {
        if (group.kind === "sep") {
          return '<tr class="sep-row" data-board="' + esc(group.id) + '"><td colspan="7"><input data-sep="' + esc(group.id) + '" value="' + esc(group.text || "") + '" placeholder="Разделитель" aria-label="Разделитель"></td>' +
            '<td><button type="button" data-act="sep-del" data-id="' + esc(group.id) + '" title="Убрать разделитель">×</button></td></tr>';
        }
        const members = (group.memberIds || []).map(function (id) {
          return battle.actors.find(function (actor) { return actor.id === id; });
        }).filter(Boolean);
        const head = '<tr class="squad-row" data-board="' + esc(group.id) + '"><td colspan="8"><input data-squad="' + esc(group.id) + '" value="' + esc(group.name || "Отряд") + '" aria-label="Отряд"></td></tr>';
        return head + members.map(function (actor) { return fighterRow(actor, now, group.id); }).join("");
      }).join("");
      return rowsHtml || '<tr><td colspan="8">Бой пуст. Средняя кнопка мыши добавляет бойца.</td></tr>';
    }

    function paint() {
      if (!alive) return;
      const now = active();
      const prev = host.querySelector(".battle-sheet");
      const scroll = prev ? prev.scrollTop : 0;
      host.innerHTML = '<div class="battle-desk"><section class="battle-sheet">' + toolsHtml(now) +
        '<table class="cast queue-table fight-table"><thead><tr><th></th><th></th><th>Число</th><th>Имя</th><th>Хиты</th><th></th><th></th><th></th></tr></thead><tbody>' +
        sheetHtml(now) + "</tbody></table></section>" +
        '<aside class="battle-log-pane"><label>Лог боя<textarea id="battle-log">' + esc(logText(battle.log)) + "</textarea></label></aside></div>";
      const sheet = host.querySelector(".battle-sheet");
      if (sheet) sheet.scrollTop = scroll;
      bind();
    }

    function loadItems() {
      if (window.allItems) return Promise.resolve();
      return new Promise(function (resolve) {
        const node = document.createElement("script");
        node.src = "/catalog/items.js";
        node.onload = function () { resolve(); };
        node.onerror = function () { resolve(); };
        document.head.appendChild(node);
      });
    }

    function itemTitle(item) {
      return (item && item.ru && item.ru.name) || (item && item.en && item.en.name) || "";
    }

    function searchItems(text) {
      const box = document.querySelector("#battle-pop .arm-hits");
      if (!box) return;
      const q = String(text || "").trim().toLowerCase();
      if (q.length < 2 || !window.allItems) {
        itemHits = [];
        box.hidden = true;
        box.innerHTML = "";
        return;
      }
      itemHits = window.allItems.filter(function (item) {
        return item && item.en && item.en.type === "Weapon" && itemTitle(item).toLowerCase().indexOf(q) >= 0;
      }).slice(0, 8);
      box.hidden = !itemHits.length;
      box.innerHTML = itemHits.map(function (item, index) {
        return '<button type="button" data-item="' + index + '">' + esc(itemTitle(item)) + "</button>";
      }).join("");
    }

    function popActor() {
      return battle.actors.find(function (actor) { return actor.id === popActorId; }) || null;
    }

    function openAdd() {
      const squads = battle.board.filter(function (group) { return group.kind !== "sep"; });
      const options = '<option value="">Новый отряд</option>' + squads.map(function (group) {
        return '<option value="' + esc(group.id) + '">' + esc(group.name || "Отряд") + "</option>";
      }).join("");
      draft = { portrait: "", note: "" };
      openPop("Боец в отряд",
        '<label>Отряд<select id="add-squad">' + options + "</select></label>" +
        '<label>Имя нового отряда<input id="add-squad-name" type="text" value="Отряд"></label>' +
        '<label>Сторона<select id="add-side"><option value="foe">Враг</option><option value="player">Герой</option></select></label>' +
        '<label>Имя<input id="add-name" type="text" placeholder="Бандит"></label>' +
        '<div class="battle-pair"><label>Хиты<input id="add-hp" type="number" min="1" value="11"></label>' +
        '<label>КД<input id="add-ac" type="number" min="0" value="12"></label></div>' +
        '<label>Оружие<input id="add-weapon" type="text" value="Атака"></label>' +
        '<div class="battle-pair"><label>Атака<input id="add-bonus" type="number" value="3"></label>' +
        '<label>Урон<input id="add-damage" type="text" value="1d6+1"></label></div>' +
        '<label>Сколько<input id="add-count" type="number" min="1" max="12" value="1"></label>' +
        '<label>Из справочника<input id="add-find" type="text" placeholder="Бандит" aria-label="Поиск монстра"></label>' +
        '<div class="battle-hits monster-hits" hidden></div>' +
        '<button type="button" data-act="add-fighter">Добавить</button>');
    }

    function openSep() {
      openPop("Разделитель",
        '<label>Подпись<input id="sep-text" type="text" placeholder="Волна, пауза, заметка"></label>' +
        '<button type="button" data-act="add-sep">Добавить</button>');
    }

    function openCodexSquads() {
      const shelf = book();
      const squads = shelf.squads || [];
      const html = squads.length ? squads.map(function (squad) {
        const names = (squad.memberIds || []).map(function (id) {
          const person = (shelf.npcs || []).find(function (row) { return row.id === id; });
          return person ? person.name : "";
        }).filter(Boolean).join(", ");
        return '<button type="button" data-codex-squad="' + esc(squad.id) + '"><b>' + esc(squad.name || "Отряд") + "</b><span>" + esc(names || "пусто") + "</span></button>";
      }).join("") : '<p class="note">В справочнике нет отрядов.</p>';
      openPop("Отряд из справочника", '<div class="battle-hits">' + html + "</div>");
    }

    function realArms(actor) {
      return armsOf(actor).filter(function (arm) {
        const name = String(arm.name || "").trim().toLowerCase();
        return name && name !== "атака";
      });
    }

    function openQuickAttack() {
      const list = rows();
      const now = list[battle.turn] && list[battle.turn].actor;
      const actors = list.map(function (row) { return row.actor; });
      actors.sort(function (a, b) {
        const rank = function (actor) {
          if (now && actor.id === now.id) return 0;
          return actor.dead ? 2 : 1;
        };
        return rank(a) - rank(b);
      });
      const html = actors.length ? actors.map(function (actor) {
        const on = now && actor.id === now.id ? " is-on" : "";
        return '<button type="button" class="quick-who' + on + '" data-attacker="' + esc(actor.id) + '">' +
          esc(actor.name || "—") + (actor.dead ? " †" : "") + "</button>";
      }).join("") : '<p class="note">Бой пуст.</p>';
      openPop("Кто атакует", '<div class="battle-hits">' + html + "</div>");
    }

    function openQuickArms(actor) {
      const arms = realArms(actor);
      let body = '<button type="button" data-act="quick-back">К списку</button>';
      if (arms.length) {
        body += '<div class="battle-hits">' + arms.map(function (arm) {
          const bonus = Math.round(Number(arm.bonus) || 0);
          const sign = bonus > 0 ? "+" : "";
          return '<button type="button" data-arm-go="' + esc(arm.id) + '"><b>' + esc(arm.name) + "</b><span>" +
            sign + bonus + " · " + esc(arm.damage || "") + "</span></button>";
        }).join("") + "</div>";
      } else {
        const dice = [4, 6, 8, 10, 12, 20, 100].map(function (n) {
          return '<button type="button" data-die-go="' + n + '">d' + n + "</button>";
        }).join("");
        body += '<p class="quick-plain">атака</p><div class="die-picks">' + dice + "</div>";
      }
      openPop(actor.name || "Атака", body);
      popActorId = actor.id;
    }

    function openFighter(actor) {
      armsOf(actor);
      popActorId = actor.id;
      let armed = false;
      const weapons = actor.weapons.map(function (arm) {
        const on = !armed && (arm.id === actor.armId || arm.name === actor.weapon);
        if (on) armed = true;
        return '<label class="check"><input type="radio" name="arm" value="' + esc(arm.id) + '"' + (on ? " checked" : "") + "> " +
          esc(arm.name || "Атака") + " · " + esc(String(arm.bonus || 0)) + " · " + esc(arm.damage || "") + "</label>";
      }).join("");
      const targets = battle.actors.filter(function (row) { return row.id !== actor.id; }).map(function (row) {
        return '<option value="' + esc(row.id) + '"' + (row.id === actor.targetId ? " selected" : "") + ">" + esc(row.name || "—") + (row.dead ? " †" : "") + "</option>";
      }).join("");
      const marks = MARKS.map(function (item) {
        const on = (actor.marks || []).indexOf(item[0]) >= 0;
        return '<button type="button" data-mark="' + item[0] + '" class="' + (on ? "is-on" : "") + '">' + item[1] + "</button>";
      }).join("");
      openPop(actor.name || "Боец",
        '<button type="button" data-act="life">' + (actor.dead ? "Оживить" : "Убить") + "</button>" +
        '<details class="pop-fold"><summary>Атака</summary>' + weapons +
        '<label>Цель<select id="arm-target"><option value="">Сама выберется</option>' + targets + "</select></label>" +
        '<div class="row"><button type="button" data-act="strike">Атаковать</button><button type="button" data-act="wound">Урон в цель</button></div>' +
        '<details class="pop-fold"><summary>Добавить оружие</summary>' +
        '<label>Из справочника<input id="arm-find" type="text" placeholder="Меч, лук" aria-label="Поиск оружия"></label>' +
        '<div class="battle-hits arm-hits" hidden></div>' +
        '<div class="battle-pair"><label>Имя<input id="arm-name" type="text" placeholder="Меч"></label>' +
        '<label>Атака<input id="arm-bonus" type="number" value="0"></label></div>' +
        '<label>Урон<input id="arm-damage" type="text" placeholder="1d8+3"></label>' +
        '<button type="button" data-act="arm-add">Добавить оружие</button></details></details>' +
        '<details class="pop-fold"><summary>Статус</summary><div class="mark-picks">' + marks + "</div></details>");
      popActorId = actor.id;
    }

    function field(id) {
      return document.getElementById(id);
    }

    function chosenArm(actor) {
      const picked = pop && pop.querySelector('input[name="arm"]:checked');
      const arm = actor.weapons.find(function (row) { return row.id === (picked && picked.value); }) || actor.weapons[0];
      useArm(actor, arm);
      if (arm) actor.armId = arm.id;
      const target = field("arm-target");
      actor.targetId = target ? target.value : "";
      return arm;
    }

    function addFighters() {
      const side = field("add-side") && field("add-side").value === "player" ? "player" : "foe";
      const count = Math.min(12, Math.max(1, Number(field("add-count") && field("add-count").value) || 1));
      const rawName = (field("add-name") && field("add-name").value || "").trim() || (side === "player" ? "Герой" : "Враг");
      const picked = field("add-squad") ? field("add-squad").value : "";
      let group = picked && battle.board.find(function (row) { return row.id === picked && row.kind !== "sep"; });
      const squadName = group ? group.name : ((field("add-squad-name") && field("add-squad-name").value || "").trim() || rawName);
      if (!group) {
        group = { id: crypto.randomUUID(), kind: "squad", name: squadName, memberIds: [] };
        battle.board.splice(Math.max(0, Math.min(insertAt, battle.board.length)), 0, group);
      }
      const made = [];
      for (let i = 0; i < count; i++) {
        const actor = blank(side);
        actor.name = count > 1 ? rawName + " " + (i + 1) : rawName;
        actor.hp = Math.max(1, Math.round(Number(field("add-hp") && field("add-hp").value) || actor.hp));
        actor.hpMax = actor.hp;
        actor.ac = Math.max(0, Math.round(Number(field("add-ac") && field("add-ac").value) || actor.ac));
        actor.weapon = (field("add-weapon") && field("add-weapon").value) || actor.weapon;
        actor.damage = (field("add-damage") && field("add-damage").value) || actor.damage;
        actor.bonus = Math.round(Number(field("add-bonus") && field("add-bonus").value) || 0);
        actor.portrait = draft.portrait || "";
        actor.note = draft.note || "";
        actor.weapons = [];
        armsOf(actor);
        battle.actors.push(actor);
        group.memberIds.push(actor.id);
        made.push(actor);
      }
      if (side !== "player") {
        const linked = remember(made[0], group.name, group.codexSquadId);
        if (linked) group.codexSquadId = linked.id;
        made.slice(1).forEach(function (actor) { remember(actor, group.name, group.codexSquadId); });
      } else {
        made.forEach(function (actor) { remember(actor, "", ""); });
      }
      assignInks(battle);
      closePop();
      save();
      paint();
    }

    function addSep() {
      const text = (field("sep-text") && field("sep-text").value || "").trim();
      battle.board.splice(Math.max(0, Math.min(insertAt, battle.board.length)), 0, {
        id: crypto.randomUUID(),
        kind: "sep",
        text: text
      });
      closePop();
      save();
      paint();
    }

    function takeSquad(id) {
      const shelf = book();
      const squad = (shelf.squads || []).find(function (row) { return row.id === id; });
      if (!squad) return;
      const group = {
        id: crypto.randomUUID(),
        kind: "squad",
        name: squad.name || "Отряд",
        memberIds: [],
        codexSquadId: squad.id
      };
      (squad.memberIds || []).forEach(function (pid) {
        const person = (shelf.npcs || []).find(function (row) { return row.id === pid; });
        if (!person) return;
        let actor = battle.actors.find(function (row) { return row.codexId === person.id; });
        if (!actor) {
          actor = blank(person.role === "enemy" ? "foe" : "player");
          actor.name = person.name || actor.name;
          actor.hp = person.hpMax || person.hp || actor.hp;
          actor.hpMax = actor.hp;
          actor.weapon = person.weapon || actor.weapon;
          actor.damage = person.damage || actor.damage;
          actor.bonus = Number(person.bonus) || actor.bonus;
          actor.ac = Number(person.ac) || actor.ac;
          actor.portrait = person.portrait || "";
          actor.note = person.note || "";
          actor.codexId = person.id;
          actor.weapons = [];
          armsOf(actor);
          battle.actors.push(actor);
        }
        battle.board.forEach(function (row) {
          if (!row.memberIds) return;
          row.memberIds = row.memberIds.filter(function (mid) { return mid !== actor.id; });
        });
        group.memberIds.push(actor.id);
      });
      battle.board = battle.board.filter(function (row) { return row.kind === "sep" || (row.memberIds && row.memberIds.length); });
      if (!group.memberIds.length) return;
      const at = Math.max(0, Math.min(insertAt, battle.board.length));
      battle.board.splice(at, 0, group);
      assignInks(battle);
      closePop();
      save();
      paint();
    }

    function addArm(actor) {
      const bonus = Math.round(Number(field("arm-bonus") && field("arm-bonus").value) || 0);
      const arm = {
        id: crypto.randomUUID(),
        name: (field("arm-name") && field("arm-name").value || "").trim() || "Оружие",
        damage: (field("arm-damage") && field("arm-damage").value || "").trim() || "1d6",
        bonus: bonus
      };
      actor.weapons.push(arm);
      actor.armId = arm.id;
      useArm(actor, arm);
      save();
      openFighter(actor);
    }

    function toggleLife(actor) {
      if (actor.dead || (Number(actor.hp) || 0) <= 0) {
        actor.dead = false;
        if ((Number(actor.hp) || 0) <= 0) actor.hp = Math.max(1, Math.round((actor.hpMax || 1) / 2));
        note((actor.name || "Боец") + " снова в строю");
        closePop();
        save();
        paint();
        return;
      }
      actor.hp = 0;
      actor.dead = true;
      note((actor.name || "Боец") + " выбывает");
      closePop();
      const list = rows();
      const at = list.findIndex(function (row) { return row.actor.id === actor.id; });
      if (at >= 0 && at === battle.turn) step(1);
      else {
        save();
        paint();
      }
    }

    function toggleMark(actor, id) {
      actor.marks = actor.marks || [];
      const at = actor.marks.indexOf(id);
      if (at >= 0) actor.marks.splice(at, 1);
      else actor.marks.push(id);
      save();
      const button = pop && pop.querySelector('[data-mark="' + id + '"]');
      if (button) button.classList.toggle("is-on", actor.marks.indexOf(id) >= 0);
      const face = host.querySelector('[data-face="' + actor.id + '"]');
      const label = face && face.closest(".fight-face");
      if (label) {
        const old = label.querySelector(".mark-stack");
        if (old) old.remove();
        const icons = markIcons(actor.marks);
        if (icons) face.insertAdjacentHTML("beforebegin", icons);
      }
    }

    function bind() {
      const shown = host.querySelector("#battle-screen");
      if (shown) shown.addEventListener("change", function () {
        battle.screen = shown.checked;
        save();
      });
      const round = host.querySelector("#battle-round");
      if (round) round.addEventListener("change", function () {
        battle.round = Math.max(1, Math.round(Number(round.value) || 1));
        save();
        paint();
      });
      host.querySelectorAll("[data-go]").forEach(function (button) {
        button.addEventListener("click", function () {
          const actor = battle.actors.find(function (row) { return row.id === button.getAttribute("data-go"); });
          if (!actor) return;
          selectActor(actor);
          save();
          paint();
        });
      });
      ["#battle-bg", "#battle-ink", "#battle-player", "#battle-foe", "#battle-brass"].forEach(function (sel) {
        const input = host.querySelector(sel);
        if (!input) return;
        input.addEventListener("input", function () {
          battle[sel.slice(8)] = input.value;
          save();
        });
      });
      const image = host.querySelector("#battle-image");
      if (image) image.addEventListener("change", function () {
        battle.image = image.value;
        save();
      });
      const file = host.querySelector("#battle-file");
      if (file) file.addEventListener("change", function () {
        const picked = file.files && file.files[0];
        if (!picked || !ctx.upload) return;
        ctx.upload(picked).then(function (url) {
          battle.image = url;
          const lib = ctx.library ? ctx.library() : ctx.campaign.library;
          if (window.ShirmoLib && lib) window.ShirmoLib.keep(lib, { url: url, name: picked.name || "Фон боя", section: "Бой" });
          save();
          paint();
        });
      });
      [["#battle-scale", "imageScale", 20, 200, 100, "%"], ["#battle-x", "imageX", 0, 100, 50, ""], ["#battle-y", "imageY", 0, 100, 50, ""]].forEach(function (spec) {
        const input = host.querySelector(spec[0]);
        if (!input) return;
        function read() {
          battle[spec[1]] = Math.min(spec[3], Math.max(spec[2], Math.round(Number(input.value) || spec[4])));
          const out = input.parentElement && input.parentElement.querySelector("b");
          if (out) out.textContent = battle[spec[1]] + spec[5];
        }
        input.addEventListener("input", read);
        input.addEventListener("change", function () { read(); save(); });
      });
      host.querySelectorAll("[data-fold]").forEach(function (button) {
        button.addEventListener("click", function () {
          const id = button.getAttribute("data-fold");
          const more = host.querySelector('[data-more="' + id + '"]');
          if (!more) return;
          more.hidden = !more.hidden;
          openId = more.hidden ? "" : id;
          button.textContent = more.hidden ? "▾" : "▴";
        });
      });
      host.querySelectorAll("[data-face]").forEach(function (input) {
        input.addEventListener("change", function () {
          const picked = input.files && input.files[0];
          const actor = battle.actors.find(function (row) { return row.id === input.getAttribute("data-face"); });
          if (!picked || !actor || !ctx.upload) return;
          ctx.upload(picked).then(function (url) {
            actor.portrait = url;
            const lib = ctx.library ? ctx.library() : ctx.campaign.library;
            if (window.ShirmoLib && lib) window.ShirmoLib.keep(lib, { url: url, name: (actor.name || "Боец") + " — портрет", section: "Бой" });
            const person = actor.codexId && ctx.campaign.codex && (ctx.campaign.codex.npcs || []).find(function (row) { return row.id === actor.codexId; });
            if (person) person.portrait = url;
            save();
            paint();
          });
        });
      });
      host.querySelectorAll("[data-q]").forEach(function (input) {
        function apply() {
          const actor = battle.actors.find(function (row) { return row.id === input.getAttribute("data-id"); });
          if (!actor) return "";
          const key = input.getAttribute("data-q");
          if (key === "boss") actor.boss = !!input.checked;
          else if (key === "name" || key === "weapon" || key === "damage") {
            actor[key] = input.value;
            const arm = (actor.weapons || []).find(function (row) { return row.id === actor.armId; }) || (actor.weapons || [])[0];
            if (arm && key === "weapon") arm.name = input.value;
            if (arm && key === "damage") arm.damage = input.value;
          } else if (key === "color") {
            actor.color = inkOk(input.value) ? input.value : "";
          } else {
            actor[key] = Math.round(Number(input.value) || 0);
            if (key === "hpMax") actor.hpMax = Math.max(1, actor.hpMax || 1);
            if (key === "hp" || key === "hpMax") setHp(actor, key === "hp" ? actor.hp : actor.hp);
          }
          return key;
        }
        if (input.type === "range") {
          input.addEventListener("input", function () {
            apply();
            const stack = input.closest(".hp-stack");
            const read = input.closest(".hp-cell") && input.closest(".hp-cell").querySelector(".hp-read");
            if (read) read.textContent = input.value;
            const bar = stack && stack.querySelector(".hp-meter i");
            if (bar) {
              const max = Number(input.max) || 1;
              const pct = Math.round(Number(input.value) / max * 100);
              bar.style.width = pct + "%";
              bar.style.background = hpColor(pct);
            }
            const row = input.closest("tr");
            const dead = Number(input.value) <= 0;
            if (row) row.classList.toggle("is-dead", dead);
            const life = row && row.querySelector("[data-act=life]");
            if (life) life.textContent = dead ? "Оживить" : "Убить";
          });
          input.addEventListener("change", function () { apply(); save(); });
          return;
        }
        input.addEventListener("change", function () {
          const key = apply();
          if (!key) return;
          if (key === "init" && battle.autoSort) sortBoard();
          save();
          if (key !== "name" && key !== "weapon" && key !== "damage") paint();
        });
      });
      host.querySelectorAll("[data-squad]").forEach(function (input) {
        input.addEventListener("change", function () {
          const group = battle.board.find(function (row) { return row.id === input.getAttribute("data-squad"); });
          if (!group) return;
          group.name = input.value.trim() || "Отряд";
          const shelf = ctx.campaign.codex;
          const squad = shelf && group.codexSquadId && (shelf.squads || []).find(function (row) { return row.id === group.codexSquadId; });
          if (squad) squad.name = group.name;
          save();
        });
      });
      host.querySelectorAll("[data-sep]").forEach(function (input) {
        input.addEventListener("change", function () {
          const group = battle.board.find(function (row) { return row.id === input.getAttribute("data-sep"); });
          if (!group) return;
          group.text = input.value;
          save();
        });
      });
      const logBox = host.querySelector("#battle-log");
      if (logBox) logBox.addEventListener("change", function () {
        battle.log = logBox.value.split(/\n/).map(function (line) { return line.trim(); }).filter(Boolean).slice(0, 24);
        save();
      });
    }

    function onClick(event) {
      const ink = event.target.closest("[data-ink]");
      if (ink && host.contains(ink)) {
        const actor = battle.actors.find(function (row) { return row.id === ink.getAttribute("data-id"); });
        const color = ink.getAttribute("data-ink");
        if (actor && inkOk(color)) {
          actor.color = color;
          save();
          paint();
        }
        return;
      }
      const button = event.target.closest("[data-act]");
      if (!button || !host.contains(button)) return;
      const act = button.getAttribute("data-act");
      if (act === "next") step(1);
      if (act === "prev") step(-1);
      if (act === "round-up") {
        battle.round = (Number(battle.round) || 1) + 1;
        save();
        paint();
      }
      if (act === "round-down") {
        battle.round = Math.max(1, (Number(battle.round) || 1) - 1);
        save();
        paint();
      }
      if (act === "place") {
        const foes = battle.actors.filter(function (actor) { return actor.side !== "player"; });
        if (ctx.place) ctx.place(foes);
        foes.forEach(pushMarker);
        save();
        paint();
      }
      if (act === "init") {
        battle.actors.forEach(function (actor) {
          const die = 1 + Math.floor(Math.random() * 20);
          actor.init = die + (Number(actor.initBonus) || 0);
        });
        battle.turn = 0;
        if (battle.autoSort) sortBoard();
        note("Инициатива брошена на ширме");
        save();
        paint();
      }
      if (act === "sort") {
        battle.autoSort = !battle.autoSort;
        if (battle.autoSort) sortBoard();
        save();
        paint();
      }
      if (act === "roll-init") {
        const actor = battle.actors.find(function (row) { return row.id === button.getAttribute("data-id"); });
        if (!actor) return;
        roll({
          name: actor.name || "Боец",
          label: "инициатива",
          count: 1,
          sides: 20,
          bonus: Number(actor.initBonus) || 0
        }).then(function (data) {
          const total = data && data.event && data.event.roll ? Number(data.event.roll.total) : null;
          if (total == null) return;
          actor.init = total;
          if (battle.autoSort) sortBoard();
          save();
          paint();
        });
      }
      if (act === "sep-del") {
        const id = button.getAttribute("data-id");
        battle.board = battle.board.filter(function (row) { return row.id !== id; });
        save();
        paint();
      }
      if (act === "life") {
        const actor = battle.actors.find(function (row) { return row.id === button.getAttribute("data-id"); });
        if (actor) toggleLife(actor);
      }
      if (act === "quick-attack") {
        const box = button.getBoundingClientRect();
        popX = box.left;
        popY = box.bottom + 6;
        openQuickAttack();
      }
      if (act === "row-attack") {
        const actor = battle.actors.find(function (row) { return row.id === button.getAttribute("data-id"); });
        if (!actor) return;
        const box = button.getBoundingClientRect();
        popX = box.right + 6;
        popY = box.top;
        openQuickArms(actor);
      }
    }

    function onPopClick(event) {
      const monsterBtn = event.target.closest("[data-monster]");
      if (monsterBtn && pop && pop.contains(monsterBtn)) {
        const monster = hits[Number(monsterBtn.getAttribute("data-monster"))];
        if (!monster) return;
        const actor = fromMonster(monster);
        if (field("add-name")) field("add-name").value = actor.name;
        if (field("add-hp")) field("add-hp").value = String(actor.hp);
        if (field("add-ac")) field("add-ac").value = String(actor.ac);
        if (field("add-weapon")) field("add-weapon").value = actor.weapon;
        if (field("add-bonus")) field("add-bonus").value = String(actor.bonus);
        if (field("add-damage")) field("add-damage").value = actor.damage;
        if (field("add-side")) field("add-side").value = "foe";
        draft = { portrait: actor.portrait || "", note: actor.note || "" };
        return;
      }
      const itemBtn = event.target.closest("[data-item]");
      if (itemBtn && pop && pop.contains(itemBtn)) {
        const item = itemHits[Number(itemBtn.getAttribute("data-item"))];
        if (!item) return;
        const title = itemTitle(item);
        const bonus = title.match(/[+](\d+)/);
        if (field("arm-name")) field("arm-name").value = title;
        if (field("arm-bonus") && bonus) field("arm-bonus").value = bonus[1];
        return;
      }
      const squadBtn = event.target.closest("[data-codex-squad]");
      if (squadBtn && pop && pop.contains(squadBtn)) {
        takeSquad(squadBtn.getAttribute("data-codex-squad"));
        return;
      }
      const whoBtn = event.target.closest("[data-attacker]");
      if (whoBtn && pop && pop.contains(whoBtn)) {
        const actor = battle.actors.find(function (row) { return row.id === whoBtn.getAttribute("data-attacker"); });
        if (actor) openQuickArms(actor);
        return;
      }
      const armBtn = event.target.closest("[data-arm-go]");
      if (armBtn && pop && pop.contains(armBtn)) {
        const actor = popActor();
        const arm = actor && armsOf(actor).find(function (row) { return row.id === armBtn.getAttribute("data-arm-go"); });
        if (actor && arm) {
          useArm(actor, arm);
          actor.armId = arm.id;
          closePop();
          attack(actor);
        }
        return;
      }
      const dieBtn = event.target.closest("[data-die-go]");
      if (dieBtn && pop && pop.contains(dieBtn)) {
        const actor = popActor();
        const sides = Number(dieBtn.getAttribute("data-die-go")) || 6;
        if (!actor) return;
        const foe = currentFoe(actor);
        closePop();
        roll({
          name: actor.name || "Боец",
          label: "атака" + (foe ? " по " + (foe.name || "цели") : ""),
          count: 1,
          sides: sides,
          bonus: 0
        });
        return;
      }
      const markBtn = event.target.closest("[data-mark]");
      if (markBtn && pop && pop.contains(markBtn)) {
        const actor = popActor();
        if (actor) toggleMark(actor, markBtn.getAttribute("data-mark"));
        return;
      }
      const button = event.target.closest("[data-act]");
      if (!button || !pop || !pop.contains(button)) return;
      const act = button.getAttribute("data-act");
      const actor = popActor();
      if (act === "pop-close") closePop();
      if (act === "quick-back") openQuickAttack();
      if (act === "add-fighter") addFighters();
      if (act === "add-sep") addSep();
      if (act === "arm-add" && actor) addArm(actor);
      if (act === "strike" && actor) {
        chosenArm(actor);
        attack(actor);
      }
      if (act === "wound" && actor) {
        chosenArm(actor);
        damage(actor, true);
      }
      if (act === "life" && actor) toggleLife(actor);
    }

    function onPopInput(event) {
      const target = event.target;
      if (!target || !pop || !pop.contains(target)) return;
      if (target.id === "add-find") search(target.value);
      if (target.id === "arm-find") loadItems().then(function () { searchItems(target.value); });
    }

    function onMid(event) {
      if (event.button !== 1 || !host.contains(event.target)) return;
      event.preventDefault();
      const row = event.target.closest && event.target.closest("[data-board]");
      if (row) {
        const index = battle.board.findIndex(function (group) { return group.id === row.getAttribute("data-board"); });
        insertAt = index < 0 ? battle.board.length : index + 1;
      } else insertAt = battle.board.length;
      popX = event.clientX;
      popY = event.clientY;
      openWheel(event.clientX, event.clientY);
    }

    function onMenu(event) {
      const row = event.target.closest && event.target.closest("[data-fighter]");
      if (!row || !host.contains(row)) return;
      event.preventDefault();
      const actor = battle.actors.find(function (item) { return item.id === row.getAttribute("data-fighter"); });
      if (!actor) return;
      closeWheel();
      popX = event.clientX;
      popY = event.clientY;
      openFighter(actor);
    }

    function onPointerMove(event) {
      if (!wheel) return;
      const next = wheelIndex(event.clientX, event.clientY);
      if (next !== wheel.index) {
        wheel.index = next;
        paintWheel();
      }
    }

    function onPointerUp(event) {
      if (!wheel || event.button !== 1) return;
      runWheel(wheelIndex(event.clientX, event.clientY));
    }

    function onDocDown(event) {
      if (pop && !pop.contains(event.target) && event.button === 0) closePop();
    }


    function stopMid(event) {
      if (event.button === 1) event.preventDefault();
    }

    host.addEventListener("click", onClick);
    host.addEventListener("pointerdown", onMid);
    host.addEventListener("mousedown", stopMid);
    host.addEventListener("contextmenu", onMenu);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointerdown", onDocDown);
    host._battleFocus = function (markerId) {
      const marker = findMarker(markerId);
      if (!marker) return;
      let actor = battle.actors.find(function (row) { return row.markerId === marker.id || row.id === marker.actorId; });
      if (!actor) {
        actor = blank("foe");
        actor.name = marker.name || "Враг";
        actor.hp = marker.hp != null ? marker.hp : actor.hp;
        actor.hpMax = marker.hpMax || actor.hpMax;
        actor.ac = marker.ac || actor.ac;
        actor.weapon = marker.weapon || actor.weapon;
        actor.damage = marker.damage || actor.damage;
        actor.bonus = marker.bonus || actor.bonus;
        actor.portrait = marker.portrait || "";
        actor.markerId = marker.id;
        marker.actorId = actor.id;
        armsOf(actor);
        battle.actors.push(actor);
        const group = { id: crypto.randomUUID(), kind: "squad", name: actor.name || "Отряд", memberIds: [actor.id] };
        battle.board.push(group);
        const linked = remember(actor, group.name, "");
        if (linked) group.codexSquadId = linked.id;
        assignInks(battle);
      }
      selectActor(actor);
      save();
      paint();
    };
    host._battleOff = function () {
      alive = false;
      closeWheel();
      closePop();
      host.removeEventListener("click", onClick);
      host.removeEventListener("pointerdown", onMid);
      host.removeEventListener("mousedown", stopMid);
      host.removeEventListener("contextmenu", onMenu);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointerdown", onDocDown);
    };
    loadMonsters().then(function () { if (alive) paint(); });
    paint();
  }

  function isBoss(actor) {
    if (!actor || actor.side === "player" || actor.dead) return false;
    if (actor.boss === false) return false;
    if (actor.boss === true) return true;
    return (Number(actor.hpMax) || 0) >= 40;
  }

  function logText(log) {
    if (Array.isArray(log)) return log.join("\n");
    return String(log || "");
  }

  function groupsOf(actors) {
    const groups = [];
    actors.forEach(function (actor) {
      const init = Number(actor.init) || 0;
      const last = groups[groups.length - 1];
      if (last && last.init === init) last.actors.push(actor);
      else groups.push({ init: init, actors: [actor] });
    });
    return groups;
  }

  function faceOf(actor) {
    const frame = frameStyle(actor);
    if (actor.portrait) return '<img class="face" alt="" src="' + esc(actor.portrait) + '"' + frame + ">";
    const draw = actor.side === "player" ? SIDE_SVG.player : SIDE_SVG.foe;
    return '<div class="face face-empty side-glyph"' + frame + '><svg viewBox="0 0 24 24" aria-hidden="true">' + draw + "</svg></div>";
  }

  function trackHtml(actors, clickable, activeId) {
    if (!actors.length) return '<p class="note">Бой пуст.</p>';
    return groupsOf(actors).map(function (group) {
      const tokens = group.actors.map(function (actor) {
        const on = activeId ? actor.id === activeId : !!actor.active;
        const side = actor.side === "player" ? "player" : "npc";
        const cls = "battle-token " + side + (on ? " active" : "") + (actor.dead ? " dead" : "");
        const inner = '<span class="battle-face">' + faceOf(actor) + '</span>' + markUnder(actor.marks) + '<span class="token-name">' + esc(actor.name || "—") + "</span>";
        if (!clickable) return '<div class="' + cls + '">' + inner + "</div>";
        return '<button type="button" class="' + cls + '" data-go="' + esc(actor.id) + '" title="' + esc(actor.name || "") + '">' + inner + "</button>";
      }).join("");
      const body = group.actors.length > 1 ? '<div class="battle-bracket">' + tokens + "</div>" : tokens;
      return '<div class="battle-slot' + (group.actors.length > 1 ? " battle-tie" : "") + '"><div class="battle-num">' + esc(String(group.init)) + "</div>" + body + "</div>";
    }).join("");
  }

  function bossHtml(actors, showHp) {
    const bosses = actors.filter(isBoss);
    if (!bosses.length) return "";
    return '<div class="boss-row">' + bosses.map(function (actor) {
      const max = Number(actor.hpMax) || 1;
      const hp = Math.max(0, Math.min(max, Number(actor.hp) || 0));
      const pct = Math.round(hp / max * 100);
      const tone = pct > 50 ? "high" : pct > 25 ? "mid" : "low";
      const nums = showHp ? '<span class="boss-hp">' + esc(String(hp)) + " / " + esc(String(max)) + "</span>" : "";
      return '<div class="boss-unit"><div class="boss-name">' + esc(actor.name || "—") + nums +
        '</div><div class="boss-bar"><span class="boss-track"><i class="' + tone + '" style="width:' + pct + '%"></i></span></div></div>';
    }).join("") + "</div>";
  }

  function bannerHtml(actor) {
    if (!actor) return '<div class="turn-banner"></div>';
    const frame = frameStyle(actor);
    const face = actor.portrait
      ? '<img class="turn-face" alt="" src="' + esc(actor.portrait) + '"' + frame + ">"
      : '<div class="turn-face turn-letter side-glyph"' + frame + '><svg viewBox="0 0 24 24" aria-hidden="true">' + (actor.side === "player" ? SIDE_SVG.player : SIDE_SVG.foe) + "</svg></div>";
    return '<div class="turn-card"><div class="turn-banner"><b>' + esc(actor.name || "—") + '</b><span class="turn-face-wrap">' + face + "</span></div>" + markUnder(actor.marks) + "</div>";
  }

  function revealActive(root) {
    if (!root) return;
    const track = root.querySelector(".battle-track");
    const token = root.querySelector(".battle-token.active");
    if (!track || !token) return;
    const box = token.getBoundingClientRect();
    const rail = track.getBoundingClientRect();
    track.scrollLeft += box.left - rail.left - rail.width / 2 + box.width / 2;
  }

  function screenHtml(actors, active, log, clickable, showHp, round) {
    const text = esc(logText(log)).replace(/\n/g, "<br>");
    const head = '<p class="fight-round"><span>Раунд</span><b>' + esc(String(round || 1)) + "</b></p>";
    return head + '<div class="battle-track">' + trackHtml(actors, clickable, active && active.id) + "</div>" +
      bossHtml(actors, !!showHp) +
      '<div class="battle-mid"></div>' +
      '<div class="battle-panels"><div class="battle-panel battle-picture">' + bannerHtml(active) + "</div>" +
      '<div class="battle-panel battle-log"><div class="log-text">' + text + "</div></div></div>";
  }

  function playerHtml(page) {
    const actors = page.actors || [];
    const active = actors.find(function (actor) { return actor.active; }) || actors[0];
    const scale = Math.min(200, Math.max(20, Math.round(Number(page.imageScale) || 100)));
    const x = Math.min(100, Math.max(0, Math.round(page.imageX == null ? 50 : Number(page.imageX))));
    const y = Math.min(100, Math.max(0, Math.round(page.imageY == null ? 50 : Number(page.imageY))));
    const image = page.image
      ? "background-image:linear-gradient(rgba(6,11,22,.4), rgba(6,11,22,.55)),url('" + esc(page.image) + "');background-size:" + scale + "% auto;background-position:" + x + "% " + y + "%;background-repeat:no-repeat;"
      : "";
    return '<div class="stage play-battle" style="--b-player:' + esc(page.player || "#3ecf78") + ";--b-foe:" + esc(page.foe || "#e4533e") + ";--b-brass:" + esc(page.brass || "#e6c36a") + ";" + image + '">' +
      screenHtml(actors, active, page.log, false, false, page.round) + "</div>";
  }

  window.ShirmoBattle = { mount: mount, ensure: ensure, formula: formula, playerHtml: playerHtml, revealActive: revealActive };
})();
