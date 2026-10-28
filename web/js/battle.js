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

  function foeInkOk(value) {
    if (!inkOk(value)) return false;
    const n = parseInt(String(value).slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const light = (max + min) / 510;
    const delta = max - min;
    const sat = delta === 0 ? 0 : delta / (255 * (1 - Math.abs(2 * light - 1)));
    if (light >= 0.78 && sat < 0.4) return false;
    let hue = 0;
    if (delta) {
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
    }
    if (sat >= 0.18 && hue >= 42 && hue <= 170) return false;
    if (hue >= 18 && hue <= 70 && light >= 0.55 && sat <= 0.55) return false;
    return true;
  }

  const FOE_INKS = [
    "#e4533e", "#c0392b", "#e07a2f", "#d35400",
    "#e25c9a", "#ad3e6b", "#c46bdb", "#7a6ff0",
    "#3d8bfd", "#2457c5", "#2bb5c0", "#1a6f8a",
    "#6d4c41", "#8d4e3b"
  ];
  const HERO_EXTRA = ["#7dcea0", "#2fbf71", "#8fce4a", "#e6c36a", "#f4e7c8", "#f3ead8"];

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
      if (!actor || actor.side === "player") return;
      if (foeInkOk(actor.color)) used[actor.color.toLowerCase()] = true;
      else actor.color = "";
    });
    let cursor = 0;
    (battle.actors || []).forEach(function (actor) {
      if (!actor || actor.side === "player" || foeInkOk(actor.color)) return;
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
        for (let n = 0; n < 36; n++) {
          const hue = (cursor * 23 + n * 19) % 360;
          if (hue > 40 && hue < 175) continue;
          const candidate = hslHex(hue, 62, 46);
          if (!foeInkOk(candidate) || used[candidate.toLowerCase()]) continue;
          color = candidate;
          cursor++;
          break;
        }
      }
      if (!color) color = "#e4533e";
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
      hp: 0,
      hpMax: 0,
      ac: side === "player" ? 16 : 12,
      weapon: side === "player" ? "Атака" : "Скимитар",
      damage: side === "player" ? "1d8+3" : "1d6+1",
      bonus: side === "player" ? 6 : 3,
      initBonus: 0,
      portrait: "",
      note: "",
      turnSec: 0,
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
    const turnBeat = setInterval(function () {
      if (!alive) return;
      paintClocks();
    }, 250);
    let custom = { name: "Огр", hp: 59, ac: 11, bonus: 6, damage: "2d8+4", weapon: "Дубина", count: 1 };
    let timerOwner = "";

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
      const prev = active();
      const list = rows();
      const at = list.findIndex(function (row) { return row.actor.id === actor.id; });
      if (at < 0) return;
      battle.turn = at;
      const now = active();
      if (prev && now && prev.id !== now.id) holdTurn(prev, now);
    }

    function fxOptions(current) {
      const list = [["", "Без эффекта"], ["sand", "Песок"], ["magic", "Часы"], ["smoke", "Дым"], ["blizzard", "Вьюга"], ["fire", "Пожар"], ["flood", "Потоп"]];
      return list.map(function (item) {
        return '<option value="' + item[0] + '"' + (item[0] === (current || "") ? " selected" : "") + ">" + item[1] + "</option>";
      }).join("");
    }

    function readClock(row) {
      const budget = Math.max(0, Math.round(Number(row && row.turnSec) || 0)) * 1000;
      if (!row || !budget) return { budget: 0, left: 0, running: false, paused: false };
      if (row.turnRun && row.turnUntil) {
        const left = Math.max(0, row.turnUntil - Date.now());
        if (left <= 0) {
          const id = row.id;
          row.turnRun = false;
          row.turnUntil = 0;
          row.turnLeft = 0;
          if (timerOwner === id && window.ShirmoClock && window.ShirmoClock.pause) window.ShirmoClock.pause();
          return { budget: budget, left: 0, running: false, paused: false };
        }
        return { budget: budget, left: left, running: true, paused: false };
      }
      if (row.turnLeft > 0 && row.turnLeft < budget) return { budget: budget, left: row.turnLeft, running: false, paused: true };
      return { budget: budget, left: budget, running: false, paused: false };
    }

    function toggleClock(row) {
      const state = readClock(row);
      if (!state.budget) return;
      if (state.running) {
        row.turnLeft = state.left;
        row.turnRun = false;
        row.turnUntil = 0;
        return;
      }
      const left = state.paused ? state.left : state.budget;
      row.turnLeft = left;
      row.turnRun = true;
      row.turnUntil = Date.now() + left;
    }

    function follow(row) {
      if (!row) return;
      timerOwner = row.id;
      const state = readClock(row);
      if (!window.ShirmoFight) return;
      window.ShirmoFight({
        seconds: Math.round(Number(row.turnSec) || 0),
        left: state.left,
        running: !!state.running,
        paused: !state.running,
        kind: row.turnFx || "",
        showPlayers: !!state.running
      });
    }

    function pauseClock(row) {
      const state = readClock(row);
      if (!state.running) return false;
      row.turnLeft = state.left;
      row.turnRun = false;
      row.turnUntil = 0;
      return true;
    }

    function holdTurn(prev, now) {
      if (battle.turnPause === false || !prev) return;
      const stopped = {};
      if (pauseClock(prev)) stopped[prev.id] = true;
      const left = groupOfActor(prev.id);
      const right = now && groupOfActor(now.id);
      if (left && (!right || left.id !== right.id) && pauseClock(left)) stopped[left.id] = true;
      if (timerOwner && stopped[timerOwner] && window.ShirmoClock && window.ShirmoClock.pause) window.ShirmoClock.pause();
    }

    function paintClock(node, button, row) {
      const state = readClock(row);
      if (node) node.textContent = state.budget ? clockText(state.left) : "";
      if (!button) return;
      button.textContent = state.running ? "Пауза" : (state.paused ? "Дальше" : "Старт");
    }

    function paintClocks() {
      host.querySelectorAll("[data-turn]").forEach(function (node) {
        const actor = battle.actors.find(function (row) { return row.id === node.getAttribute("data-turn"); });
        const button = host.querySelector('[data-act="turn-toggle"][data-id="' + node.getAttribute("data-turn") + '"]');
        paintClock(node, button, actor);
      });
      host.querySelectorAll("[data-squad-clock]").forEach(function (node) {
        const group = (battle.board || []).find(function (row) { return row.id === node.getAttribute("data-squad-clock"); });
        const button = host.querySelector('[data-act="squad-toggle"][data-id="' + node.getAttribute("data-squad-clock") + '"]');
        paintClock(node, button, group);
      });
      host.querySelectorAll(".token-time").forEach(function (node) {
        const actor = battle.actors.find(function (row) { return row.id === node.getAttribute("data-actor"); });
        const state = readClock(actor);
        if (!state.budget) {
          node.textContent = "";
          return;
        }
        node.textContent = state.running || state.paused ? clockText(state.budget) + " / " + clockText(state.left) : clockText(state.budget);
      });
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

    function dropMarkers(ids) {
      const kill = {};
      (ids || []).forEach(function (id) { if (id) kill[id] = true; });
      if (!Object.keys(kill).length) return;
      (ctx.campaign.pages || []).forEach(function (page) {
        (page.views || []).forEach(function (view) {
          view.markers = (view.markers || []).filter(function (row) { return !(row && kill[row.id]); });
          (view.locations || []).forEach(function (loc) {
            if (!loc || !loc.markers) return;
            loc.markers = loc.markers.filter(function (row) { return !(row && kill[row.id]); });
          });
        });
      });
    }

    function dropSquadFromBattle(groupId) {
      const group = (battle.board || []).find(function (row) { return row && row.id === groupId && row.kind !== "sep"; });
      if (!group) return;
      const memberIds = {};
      (group.memberIds || []).forEach(function (id) { memberIds[id] = true; });
      const markerIds = [];
      (battle.actors || []).forEach(function (actor) {
        if (!actor || !memberIds[actor.id]) return;
        if (actor.markerId) markerIds.push(actor.markerId);
      });
      dropMarkers(markerIds);
      battle.actors = (battle.actors || []).filter(function (actor) { return !(actor && memberIds[actor.id]); });
      battle.board = (battle.board || []).filter(function (row) { return row && row.id !== groupId; });
      const list = rows();
      if (list.length) battle.turn = Math.min(Number(battle.turn) || 0, list.length - 1);
      else battle.turn = 0;
      save();
      paint();
    }

    function dropFighter(actorId) {
      const actor = (battle.actors || []).find(function (row) { return row && row.id === actorId; });
      if (!actor) return;
      if (actor.markerId) dropMarkers([actor.markerId]);
      battle.actors = (battle.actors || []).filter(function (row) { return !(row && row.id === actorId); });
      (battle.board || []).forEach(function (group) {
        if (!group || !group.memberIds) return;
        group.memberIds = group.memberIds.filter(function (id) { return id !== actorId; });
      });
      battle.board = (battle.board || []).filter(function (row) {
        return row && (row.kind === "sep" || (row.memberIds && row.memberIds.length));
      });
      const list = rows();
      if (list.length) battle.turn = Math.min(Number(battle.turn) || 0, list.length - 1);
      else battle.turn = 0;
      save();
      paint();
    }

    function note(text) {
      battle.log.unshift(text);
      battle.log = battle.log.slice(0, 24);
    }

    function setHp(actor, value) {
      actor.hp = Math.max(0, Math.min(actor.hpMax || 999, Math.round(value)));
      actor.dead = actor.hp <= 0;
      pushMarker(actor);
      syncPerson(actor, ["hp", "hpMax"]);
      if (actor.heroId) {
        const hero = (book().heroes || []).find(function (row) { return row && row.id === actor.heroId; });
        if (hero) {
          hero.hp = actor.hp;
          hero.hpMax = actor.hpMax;
        }
      }
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

    function boneRoll(text, crit) {
      const spec = formula(text);
      const faces = [];
      let sum = 0;
      for (let i = 0; i < spec.count; i++) {
        const value = 1 + Math.floor(Math.random() * spec.sides);
        faces.push(value);
        sum += value;
      }
      const bonus = Number(spec.bonus) || 0;
      const bones = crit ? sum * 2 : sum;
      return { total: bones + bonus, faces: faces, bonus: bonus, crit: !!crit };
    }

    function boneText(rolled) {
      const body = rolled.faces.join("+");
      const bones = rolled.crit ? "(" + body + ")×2" : body;
      const sign = rolled.bonus ? (rolled.bonus > 0 ? "+" : "") + rolled.bonus : "";
      return bones + sign + " = " + rolled.total;
    }

    function splash(kind, amount) {
      if (ctx.splash) ctx.splash(kind, amount);
    }

    function attack(actor) {
      const foe = currentFoe(actor);
      if (!foe) {
        note((actor.name || "Боец") + " — нет цели для атаки");
        save();
        paint();
        return;
      }
      actor.targetId = foe.id;
      openStrike(actor, foe);
      castCheck(actor, foe, null);
    }

    function castCheck(actor, foe, face) {
      const bonus = Math.round(Number(actor.bonus) || 0);
      const ac = Math.max(0, Math.round(Number(foe.ac) || 10));
      const spec = {
        name: actor.name || "Боец",
        label: (actor.weapon || "Атака") + " по " + (foe.name || "цели"),
        count: 1,
        sides: 20,
        bonus: bonus,
        ac: ac,
        quiet: true
      };
      if (face != null) spec.face = face;
      if (!ctx.roll) return;
      ctx.roll(spec).then(function (data) {
        const rolled = data && data.event && data.event.roll ? data.event.roll : null;
        if (!rolled || !pop || pop._foeId !== foe.id) {
          const rawDie = rolled && rolled.dice && rolled.dice[0] ? Number(rolled.dice[0].value) : NaN;
          const raw = Number.isFinite(rawDie) ? rawDie : NaN;
          const result = Number.isFinite(raw) ? handVerdict(raw, bonus, ac) : null;
          if (result) note(result.text + " · " + (actor.name || "Боец") + " → " + (foe.name || "цель"));
          save();
          return;
        }
        const rawDie = rolled.dice && rolled.dice[0] ? Number(rolled.dice[0].value) : NaN;
        const raw = Number.isFinite(rawDie) ? rawDie : (Number(rolled.total) - bonus);
        const result = handVerdict(raw, bonus, ac);
        if (!result) return;
        const die = field("strike-die");
        if (die) die.value = String(Math.round(raw));
        paintVerdict(result);
        note(result.text + " · " + (actor.name || "Боец") + " → " + (foe.name || "цель"));
        save();
      });
    }

    function takeHurt(actor, foe, total, line) {
      const n = Math.max(0, Math.round(Number(total) || 0));
      actor.lastDamage = n;
      if (n > 0 && foe) {
        setHp(foe, (Number(foe.hp) || 0) - n);
        note((line || ((actor.name || "Боец") + " бьёт " + (foe.name || "цель"))) + " на " + n +
          (foe.dead ? " — убит" : " (" + foe.hp + "/" + (foe.hpMax || foe.hp) + ")"));
        splash("hurt", n);
      } else note(line || ((actor.name || "Боец") + " — урон 0"));
      save();
      paint();
    }

    function giveLife(actor, target, total, line) {
      const n = Math.max(0, Math.round(Number(total) || 0));
      if (!target || n <= 0) return;
      const before = Number(target.hp) || 0;
      setHp(target, before + n);
      const gained = (Number(target.hp) || 0) - before;
      note((line || ((actor.name || "Боец") + " лечит " + (target.name || "цель"))) + " на " + n +
        (gained < n ? " (стало " + target.hp + "/" + (target.hpMax || target.hp) + ")" : " (" + target.hp + "/" + (target.hpMax || target.hp) + ")"));
      splash("heal", n);
      save();
      paint();
    }

    function damage(actor, apply, crit, formulaText) {
      const foe = apply ? currentFoe(actor) : null;
      const rolled = boneRoll(formulaText || actor.damage || "1d6", crit);
      const line = (actor.name || "Боец") + (foe ? " → " + (foe.name || "цель") : "") + " · " + boneText(rolled);
      if (apply && foe) takeHurt(actor, foe, rolled.total, line);
      else {
        note(line);
        splash("hurt", rolled.total);
        save();
        paint();
      }
    }

    function currentFoe(from) {
      if (from && from.targetId) {
        const picked = battle.actors.find(function (row) { return row.id === from.targetId; });
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
      const prev = active();
      let at = battle.turn;
      for (let n = 0; n < list.length; n++) {
        at = (at + dir + list.length) % list.length;
        if (dir > 0 && at === 0) battle.round = (Number(battle.round) || 1) + 1;
        if (!list[at].actor.dead) break;
      }
      battle.turn = at;
      const now = active();
      if (prev && now && prev.id !== now.id) holdTurn(prev, now);
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
      ["hero", "Добавить героя из справочника", "Герой"],
      ["sep", "Добавить разделитель", "Разделитель"],
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

    function groupOfActor(actorId) {
      return (battle.board || []).find(function (group) {
        return group && group.kind !== "sep" && (group.memberIds || []).indexOf(actorId) >= 0;
      }) || null;
    }

    function leaveCodexSquads(personId, keepSquadId) {
      if (!personId) return;
      const shelf = book();
      (shelf.squads || []).forEach(function (squad) {
        if (!squad || !squad.memberIds) return;
        if (keepSquadId && squad.id === keepSquadId) return;
        squad.memberIds = squad.memberIds.filter(function (id) { return id !== personId; });
      });
      shelf.squads = (shelf.squads || []).filter(function (squad) {
        return squad && (squad.memberIds || []).some(Boolean);
      });
    }

    function nextCopyName(base) {
      const root = String(base || "Враг").replace(/\s+\d+$/, "").trim() || "Враг";
      let n = 2;
      const names = {};
      (battle.actors || []).forEach(function (actor) {
        if (actor && actor.name) names[actor.name] = true;
      });
      while (names[root + " " + n]) n += 1;
      return root + " " + n;
    }

    function moveActorToGroup(actorId, targetId, squadName) {
      const actor = (battle.actors || []).find(function (row) { return row && row.id === actorId; });
      if (!actor) return;
      let target = targetId && (battle.board || []).find(function (group) {
        return group && group.id === targetId && group.kind !== "sep";
      });
      if (!target) {
        if (!squadName && targetId !== "") return;
        target = {
          id: crypto.randomUUID(),
          kind: "squad",
          name: (squadName || "").trim() || actor.name || "Отряд",
          memberIds: [],
          codexSquadId: ""
        };
        battle.board.push(target);
      }
      if ((target.memberIds || []).indexOf(actorId) >= 0 && groupOfActor(actorId) === target) return;
      battle.board.forEach(function (group) {
        if (!group || !group.memberIds) return;
        group.memberIds = group.memberIds.filter(function (id) { return id !== actorId; });
      });
      target.memberIds = target.memberIds || [];
      target.memberIds.push(actorId);
      battle.board = battle.board.filter(function (group) {
        return group && (group.kind === "sep" || (group.memberIds && group.memberIds.length));
      });
      if (actor.side !== "player") {
        leaveCodexSquads(actor.codexId, target.codexSquadId || "");
        const linked = remember(actor, target.name, target.codexSquadId);
        if (linked) target.codexSquadId = linked.id;
      }
      save();
      paint();
    }

    function cloneActorInGroup(actorId) {
      const actor = (battle.actors || []).find(function (row) { return row && row.id === actorId; });
      const group = groupOfActor(actorId);
      if (!actor || !group) return;
      const copy = JSON.parse(JSON.stringify(actor));
      copy.id = crypto.randomUUID();
      copy.codexId = "";
      copy.markerId = "";
      copy.name = nextCopyName(actor.name);
      copy.weapons = (copy.weapons || []).map(function (arm) {
        return Object.assign({}, arm, { id: crypto.randomUUID() });
      });
      copy.marks = Array.isArray(copy.marks) ? copy.marks.slice() : [];
      battle.actors.push(copy);
      group.memberIds = group.memberIds || [];
      group.memberIds.push(copy.id);
      if (copy.side !== "player") {
        const linked = remember(copy, group.name, group.codexSquadId);
        if (linked) group.codexSquadId = linked.id;
      } else remember(copy, "", "");
      assignInks(battle);
      save();
      paint();
    }

    function squadOptions(selectedId) {
      return '<option value="">---</option><option value="__new__">Новый отряд</option>' + (battle.board || []).filter(function (group) {
        return group && group.kind !== "sep";
      }).map(function (group) {
        return '<option value="' + esc(group.id) + '"' + (group.id === selectedId ? " selected" : "") + ">" + esc(group.name || "Отряд") + "</option>";
      }).join("");
    }

    function openNewBattleSquad(actorId) {
      const actor = (battle.actors || []).find(function (row) { return row && row.id === actorId; });
      if (!actor) return;
      openPop("Новый отряд",
        '<label title="Название отряда">Имя<input id="new-squad-name" type="text" value="' + esc(actor.name || "Отряд") + '" placeholder="Отряд" aria-label="Имя отряда"></label>' +
        '<button type="button" data-act="make-squad">Создать</button>');
      popActorId = actor.id;
    }

    function personHp(person, fallback) {
      const rawMax = Number(person && person.hpMax);
      const rawHp = Number(person && person.hp);
      const fallMax = Number(fallback && fallback.hpMax);
      const fallHp = Number(fallback && fallback.hp);
      const max = Math.max(1, Math.round(
        (Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 0) ||
        (Number.isFinite(rawHp) && rawHp > 0 ? rawHp : 0) ||
        (Number.isFinite(fallMax) && fallMax > 0 ? fallMax : 0) ||
        (Number.isFinite(fallHp) && fallHp > 0 ? fallHp : 0) ||
        1
      ));
      const hp = Math.max(0, Math.min(max, Math.round(
        Number.isFinite(rawHp) && rawHp >= 0 ? rawHp : max
      )));
      return { hp: hp, hpMax: max };
    }

    function applyPerson(actor, person) {
      if (!actor || !person) return actor;
      const life = personHp(person, actor);
      actor.name = person.name || actor.name;
      actor.hp = life.hp;
      actor.hpMax = life.hpMax;
      actor.dead = actor.hp <= 0;
      actor.weapon = person.weapon || actor.weapon;
      actor.damage = person.damage || actor.damage;
      actor.bonus = Number(person.bonus) || actor.bonus;
      actor.ac = Number(person.ac) || actor.ac;
      actor.portrait = person.portrait || actor.portrait || "";
      actor.note = person.note || actor.note || "";
      actor.codexId = person.id;
      actor.weapons = [];
      armsOf(actor);
      return actor;
    }

    function syncPerson(actor, keys) {
      if (!actor || !actor.codexId) return;
      const shelf = book();
      const person = (shelf.npcs || []).find(function (row) { return row && row.id === actor.codexId; });
      if (!person) return;
      const all = !keys || !keys.length;
      const has = function (key) { return all || keys.indexOf(key) >= 0; };
      if (has("name")) person.name = actor.name || person.name;
      if (has("weapon")) person.weapon = actor.weapon || person.weapon;
      if (has("damage")) person.damage = actor.damage || person.damage;
      if (has("hp") || has("hpMax")) {
        person.hp = Number(actor.hp) || 0;
        person.hpMax = Number(actor.hpMax) || person.hp || 0;
      }
      if (has("ac")) person.ac = Number(actor.ac) || person.ac || 0;
      if (has("bonus")) person.bonus = Number(actor.bonus) || person.bonus || 0;
      if (has("portrait") && actor.portrait) {
        if (window.ShirmoCodex && window.ShirmoCodex.writePortrait) window.ShirmoCodex.writePortrait(person, actor.portrait);
        else person.portrait = actor.portrait;
      }
    }

    function personScore(person) {
      if (!person) return -1;
      let score = 0;
      const max = Number(person.hpMax) || 0;
      const hp = Number(person.hp) || 0;
      const life = max > 0 ? max : hp;
      if (life > 0) score += 5;
      if (life > 0 && life !== 38 && life !== 11) score += 20;
      if (String(person.note || "").trim()) score += 8;
      if (person.portrait) score += 4;
      if (String(person.weapon || "").trim()) score += 2;
      if (String(person.damage || "").trim()) score += 2;
      if (person.role === "npc" || person.role === "merchant" || person.role === "enemy") score += 1;
      return score;
    }

    function pickBestPerson(hits) {
      if (!hits || !hits.length) return null;
      if (hits.length === 1) return hits[0];
      return hits.slice().sort(function (a, b) { return personScore(b) - personScore(a); })[0];
    }

    function peopleByName(name) {
      const key = String(name || "").trim().toLowerCase();
      if (!key) return [];
      return (book().npcs || []).filter(function (row) {
        return row && String(row.name || "").trim().toLowerCase() === key;
      });
    }

    function personForActor(actor) {
      if (!actor || actor.heroId) return null;
      const shelf = book().npcs || [];
      const named = peopleByName(actor.name);
      const bestNamed = pickBestPerson(named);
      if (actor.codexId) {
        const byId = shelf.find(function (row) { return row && row.id === actor.codexId; });
        if (byId) {
          if (bestNamed && bestNamed.id !== byId.id && personScore(bestNamed) > personScore(byId) + 5) {
            actor.codexId = bestNamed.id;
            return bestNamed;
          }
          return byId;
        }
      }
      if (bestNamed) {
        actor.codexId = bestNamed.id;
        return bestNamed;
      }
      return null;
    }

    function pullPersonHp(actor, force) {
      const person = personForActor(actor);
      if (!actor || !person) return false;
      const rawMax = Number(person.hpMax);
      const rawHp = Number(person.hp);
      const hasBook = (Number.isFinite(rawMax) && rawMax > 0) || (Number.isFinite(rawHp) && rawHp > 0);
      if (!hasBook) return false;
      const life = personHp(person, null);
      const curMax = Number(actor.hpMax) || 0;
      const curHp = Number(actor.hp) || 0;
      const looksBlank = (actor.side === "player" && (curMax === 38 || curMax <= 0)) ||
        (actor.side !== "player" && (curMax === 11 || curMax <= 0));
      const bookBetter = life.hpMax !== curMax && life.hpMax > 0;
      if (!force && !looksBlank && !bookBetter) return false;
      actor.hpMax = life.hpMax;
      actor.hp = looksBlank || force || curHp >= curMax || bookBetter ? Math.min(life.hp, life.hpMax) : Math.min(curHp, life.hpMax);
      actor.dead = actor.hp <= 0;
      if (person.portrait && !actor.portrait) actor.portrait = person.portrait;
      if (person.note && !actor.note) actor.note = person.note;
      if (person.weapon && (!actor.weapon || actor.weapon === "Атака" || actor.weapon === "Скимитар")) actor.weapon = person.weapon;
      if (person.damage && (!actor.damage || actor.damage === "1d8+3" || actor.damage === "1d6+1")) actor.damage = person.damage;
      return true;
    }

    function pullBattleFromCodex(force) {
      let changed = false;
      (battle.actors || []).forEach(function (actor) {
        if (pullPersonHp(actor, force)) changed = true;
      });
      return changed;
    }

    function remember(actor, squadName, codexSquadId) {
      const shelf = book();
      shelf.npcs = shelf.npcs || [];
      shelf.squads = shelf.squads || [];
      let person = personForActor(actor);
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
        actor.codexId = person.id;
        applyPerson(actor, person);
      }
      if (actor.side === "player") return null;
      let squad = codexSquadId && shelf.squads.find(function (row) { return row.id === codexSquadId; });
      if (!squad && squadName) {
        const named = (shelf.squads || []).filter(function (row) { return row && row.name === squadName; });
        if (named.length === 1) squad = named[0];
      }
      if (!squad) {
        if (!squadName && !codexSquadId) return null;
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
      else if (item[0] === "hero") openCodexHeroes();
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
      el.style.left = "0px";
      el.style.top = "0px";
      const limitH = Math.max(160, window.innerHeight - 16);
      el.style.maxHeight = limitH + "px";
      el.style.overflowY = "auto";
      document.body.appendChild(el);
      if (el.scrollHeight > limitH || el.offsetHeight > limitH) el.style.height = limitH + "px";
      const pad = 8;
      const width = Math.min(el.offsetWidth, window.innerWidth - pad * 2);
      const height = Math.min(el.offsetHeight, limitH);
      let left = popX;
      let top = popY;
      if (left + width > window.innerWidth - pad) left = window.innerWidth - pad - width;
      if (left < pad) left = pad;
      if (top + height > window.innerHeight - pad) top = window.innerHeight - pad - height;
      if (top < pad) top = pad;
      el.style.left = Math.round(left) + "px";
      el.style.top = Math.round(top) + "px";
      el.style.visibility = "";
      pop = el;
      el.addEventListener("click", onPopClick);
      el.addEventListener("input", onPopInput);
    }

    function toneHtml() {
      const images = (ctx.library && ctx.library().images) || [];
      const current = battle.image && battle.image !== "none" ? images.find(function (image) { return image.url === battle.image; }) : null;
      const options = '<option value="">Фон локации</option><option value="none"' + (battle.image === "none" ? " selected" : "") + ">Без картинки</option>" +
        (current ? '<option value="' + esc(current.url) + '" selected>' + esc(current.name || "Картинка") + "</option>" : (battle.image && battle.image !== "none" ? '<option value="' + esc(battle.image) + '" selected>Картинка</option>' : ""));
      return '<details class="drop battle-tone"><summary>Экран игроков</summary>' +
        '<div class="tone-colors">' +
        '<label>Фон<input id="battle-bg" type="color" value="' + esc(battle.bg) + '"></label>' +
        '<label>Текст<input id="battle-ink" type="color" value="' + esc(battle.ink) + '"></label>' +
        '<label>Герои<input id="battle-player" type="color" value="' + esc(battle.player) + '"></label>' +
        '<label>Враги<input id="battle-foe" type="color" value="' + esc(battle.foe) + '"></label>' +
        '<label>Активный<input id="battle-brass" type="color" value="' + esc(battle.brass) + '"></label></div>' +
        '<label>Из библиотеки<select id="battle-image">' + options + '</select><button type="button" id="battle-image-open">Справочник</button></label>' +
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
        '<span class="turn-name">' + esc(now ? now.name : "Нет хода") + "</span>" +
        '<label class="check" title="Когда ход переходит к другому бойцу, таймер этого бойца и ушедшего отряда ставится на паузу"><input id="battle-turn-pause" type="checkbox"' + (battle.turnPause === false ? "" : " checked") + "> Пауза при смене хода</label></div>" +
        '<div class="round-bar"><button type="button" data-act="round-down" title="Предыдущий раунд">−</button>' +
        '<input id="battle-round" class="round-num" type="number" min="1" value="' + esc(String(battle.round || 1)) + '" aria-label="Раунд">' +
        '<button type="button" data-act="round-up" title="Следующий раунд">+</button>' +
        '<span class="round-word">раунд</span></div>' +
        '<div class="tool-side tool-end">' +
        '<button type="button" data-act="quick-attack" title="Кто атакует и чем. Если оружия нет — бросок кости с подписью «атака»">Атаковать</button>' +
        '<label class="check" title="Пока включено, игроки видят бой вместо карты"><input id="battle-screen" type="checkbox"' + (battle.screen !== false ? " checked" : "") + "> Игрокам</label>" +
        '<label class="check" title="Показать журнал боя рядом со списком"><input id="battle-log-on" type="checkbox"' + (battle.logOpen ? " checked" : "") + "> Журнал</label>" +
        '<button type="button" data-act="sort" class="' + (battle.autoSort ? "is-on" : "") + '" title="Большее число выше. Внутри отряда и между отрядами. Разделители остаются на месте">По числу</button>' +
        '<button type="button" data-act="init" title="Бросить инициативу всем на ширме, без показа кубиков">Инициатива всем</button>' +
        '<button type="button" data-act="place" title="Поставить врагов на текущую карту. Игроки их не видят, пока не снимете скрытие">На карту</button>' +
        '<button type="button" data-act="pull-hp" title="Подтянуть хиты и характеристики из справочника по имени">ХП из справочника</button></div></div>' +
        '<p class="note">«Атака» у портрета спрашивает, кого бить, и сравнивает бросок с КД. Герой может выбрать союзника или себя. Средняя кнопка — боец, разделитель или отряд. Правая по бойцу — статус. к20 — инициатива.</p>' +
        toneHtml();
    }

    function actorInk(actor) {
      if (inkOk(actor.color)) return actor.color;
      return actor.side === "player" ? (battle.player || "#7dcea0") : (battle.foe || "#e4533e");
    }

    function faceBox(actor) {
      const face = actor.portrait
        ? '<img alt="" src="' + esc(actor.portrait) + '">'
        : sideIcon(actor.side);
      const book = actor.side === "player" ? ""
        : '<button type="button" class="icon-btn foe-face-book" data-act="foe-face" data-id="' + esc(actor.id) + '" title="Портрет из справочника" aria-label="Портрет из справочника"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h6.2A2.8 2.8 0 0 1 14 8.3V19H7.2A2.2 2.2 0 0 0 5 21.2V5.5zM19 5.5h-6.2A2.8 2.8 0 0 0 10 8.3V19h6.8A2.2 2.2 0 0 1 19 21.2V5.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></button>';
      return '<div class="fight-face-box"><button type="button" class="fight-face" data-act="face-turn" data-id="' + esc(actor.id) + '" style="--ink:' + esc(actorInk(actor)) + '" title="Ход этого бойца">' + face + markIcons(actor.marks) +
        '</button><div class="port-tools">' +
        '<button type="button" class="port-ink" data-act="pick-ink" data-id="' + esc(actor.id) + '" style="background:' + esc(actorInk(actor)) + '" title="Цвет рамки" aria-label="Цвет рамки"></button>' +
        '<button type="button" class="icon-btn port-pic" data-act="pick-face" data-id="' + esc(actor.id) + '" title="Сменить портрет: библиотека или файл" aria-label="Сменить портрет"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="10" r="1.3" fill="currentColor"/><path d="M4 16l4.5-3.5 3 2.5 2.5-2 6 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></button>' +
        book + '</div>' +
        '<input type="file" accept="image/*" data-face="' + esc(actor.id) + '" hidden aria-label="Загрузить портрет"></div>';
    }

    function weaponButtons(actor) {
      return armsOf(actor).map(function (arm) {
        const bonus = Math.round(Number(arm.bonus) || 0);
        const sign = bonus > 0 ? "+" : "";
        return '<button type="button" data-act="arm-hit" data-id="' + esc(actor.id) + '" data-arm="' + esc(arm.id) + '" title="Сразу бить этим оружием. Дальше только выбор цели">' +
          esc(arm.name || "Атака") + " " + sign + bonus + "</button>";
      }).join("") +
        '<button type="button" data-act="custom-hurt" data-id="' + esc(actor.id) + '" title="Снять хиты своей формулой, без броска атаки">Свой урон</button>' +
        '<button type="button" data-act="heal" data-id="' + esc(actor.id) + '" title="Зелье или своё число">Лечить</button>';
    }

    function initBonusOf(actor) {
      return Math.round(Number(actor && actor.initBonus) || 0);
    }

    function initRollLabel(actor) {
      const bonus = initBonusOf(actor);
      if (!bonus) return "к20";
      return "к20" + (bonus > 0 ? "+" : "") + bonus;
    }

    function initRollTitle(actor) {
      const bonus = initBonusOf(actor);
      if (!bonus) return "Бросок инициативы к20. Игроки видят кубик";
      return "Бросок инициативы к20" + (bonus > 0 ? "+" : "") + bonus + ". Игроки видят кубик";
    }

    function cardField(label, inner) {
      return '<label class="pcard-field"><span>' + label + "</span>" + inner + "</label>";
    }

    function fighterRow(actor, now, groupId) {
      const max = Math.max(1, Math.round(Number(actor.hpMax) || 1));
      const hp = Math.max(0, Math.min(max, Math.round(Number(actor.hp) || 0)));
      const home = groupOfActor(actor.id);
      const on = now && actor.id === now.id;
      return '<article class="pcard' + (on ? " is-on" : "") + (actor.dead ? " is-dead" : "") + '" data-fighter="' + esc(actor.id) + '" data-board="' + esc(groupId) + '">' +
        '<div class="pcard-port">' + faceBox(actor) + "</div>" +
        '<div class="pcard-body">' +
        '<header class="pcard-head"><input class="pcard-name" data-q="name" data-id="' + esc(actor.id) + '" type="text" value="' + esc(actor.name || "") + '" aria-label="Имя">' +
        '<button type="button" class="pcard-turn" data-go="' + esc(actor.id) + '" title="Сделать ход этого бойца">Ход</button>' +
        '<button type="button" data-act="life" data-id="' + esc(actor.id) + '">' + (actor.dead ? "Оживить" : "Убить") + "</button></header>" +
        '<div class="pcard-groups">' +
        '<section class="pcard-group"><h4>Бой</h4><div class="pcard-row">' +
        cardField("Инициатива", '<input data-q="init" data-id="' + esc(actor.id) + '" class="num" type="number" value="' + esc(String(actor.init || 0)) + '" aria-label="Инициатива" title="Итог инициативы">') +
        cardField("Бонус", '<input data-q="initBonus" data-id="' + esc(actor.id) + '" class="num" type="number" value="' + esc(String(initBonusOf(actor))) + '" aria-label="Бонус инициативы" title="Бонус к броску к20">') +
        '<button type="button" data-act="roll-init" data-id="' + esc(actor.id) + '" title="' + esc(initRollTitle(actor)) + '">' + esc(initRollLabel(actor)) + "</button></div>" +
        cardField("КД", '<input data-q="ac" data-id="' + esc(actor.id) + '" class="num" type="number" min="0" value="' + esc(String(Number(actor.ac) || 10)) + '" aria-label="КД" title="Класс доспеха">') +
        '<div class="hp-cell"><span class="hp-stack">' + hpMeter(hp, max) +
        '<input data-q="hp" data-id="' + esc(actor.id) + '" type="range" min="0" max="' + max + '" value="' + hp + '" aria-label="Хиты"></span>' +
        cardField("Хиты", '<input data-q="hp" data-id="' + esc(actor.id) + '" class="num hp-read" type="number" min="0" max="' + max + '" value="' + hp + '" aria-label="Хиты числом">') +
        cardField("Макс.", '<input data-q="hpMax" data-id="' + esc(actor.id) + '" class="num" type="number" min="1" value="' + max + '" aria-label="Максимум хитов">') +
        "</div>" +
        '<label class="check" title="Полоса хитов на экране игроков"><input data-q="boss" data-id="' + esc(actor.id) + '" type="checkbox"' + (isBoss(actor) ? " checked" : "") + (actor.side === "player" ? " disabled" : "") + "> Полоса</label></section>" +
        '<section class="pcard-group"><h4>Атака</h4>' + weaponButtons(actor) + "</section>" +
        '<section class="pcard-group"><h4>Таймер</h4><div class="turn-cell">' +
        cardField("Сек", '<input data-q="turnSec" data-id="' + esc(actor.id) + '" class="num" type="number" min="0" value="' + esc(String(Math.max(0, Math.round(Number(actor.turnSec) || 0)))) + '" aria-label="Секунды на ход" title="0 — без таймера">') +
        cardField("Эффект", '<select class="turn-fx" data-turn-fx data-id="' + esc(actor.id) + '" aria-label="Эффект таймера">' + fxOptions(actor.turnFx) + "</select>") +
        '<button type="button" class="turn-go" data-act="turn-toggle" data-id="' + esc(actor.id) + '" title="Пуск или пауза. Эффект виден игрокам">Старт</button>' +
        '<b class="turn-left" data-turn="' + esc(actor.id) + '"></b></div></section>' +
        '<section class="pcard-group"><h4>Отряд</h4>' +
        cardField("Отряд", '<select data-move-squad="' + esc(actor.id) + '" aria-label="Отряд бойца">' + squadOptions(home && home.id) + "</select>") +
        '<div class="pcard-row"><button type="button" data-act="copy-fighter" data-id="' + esc(actor.id) + '" title="Скопировать бойца в этот же отряд">Копия</button>' +
        '<button type="button" data-act="drop-fighter" data-id="' + esc(actor.id) + '" title="Убрать этого бойца с экрана боя">Убрать</button></div></section>' +
        "</div></div></article>";
    }

    function sheetHtml(now) {
      const rowsHtml = battle.board.map(function (group) {
        if (group.kind === "sep") {
          return '<div class="sep-banner" data-board="' + esc(group.id) + '"><input data-sep="' + esc(group.id) + '" value="' + esc(group.text || "") + '" placeholder="Разделитель" aria-label="Разделитель">' +
            '<button type="button" data-act="sep-del" data-id="' + esc(group.id) + '" title="Убрать разделитель">×</button></div>';
        }
        const members = (group.memberIds || []).map(function (id) {
          return battle.actors.find(function (actor) { return actor.id === id; });
        }).filter(Boolean);
        const head = '<header class="squad-banner" data-board="' + esc(group.id) + '"><input data-squad="' + esc(group.id) + '" value="' + esc(group.name || "Отряд") + '" aria-label="Отряд">' +
          '<div class="turn-cell">' +
          cardField("Сек", '<input data-squad-sec data-id="' + esc(group.id) + '" class="num" type="number" min="0" value="' + esc(String(Math.max(0, Math.round(Number(group.turnSec) || 0)))) + '" aria-label="Секунды отряда" title="0 — без таймера">') +
          cardField("Эффект", '<select class="turn-fx" data-squad-fx data-id="' + esc(group.id) + '" aria-label="Эффект отряда">' + fxOptions(group.turnFx) + "</select>") +
          '<button type="button" class="turn-go" data-act="squad-toggle" data-id="' + esc(group.id) + '" title="Пуск или пауза таймера отряда. Эффект виден игрокам">Старт</button>' +
          '<b class="turn-left" data-squad-clock="' + esc(group.id) + '"></b></div>' +
          '<button type="button" data-act="squad-del" data-id="' + esc(group.id) + '" title="Убрать отряд из боя целиком">×</button></header>';
        return '<section class="squad-block">' + head + members.map(function (actor) { return fighterRow(actor, now, group.id); }).join("") + "</section>";
      }).join("");
      return rowsHtml || '<p class="note">Бой пуст. Средняя кнопка мыши добавляет бойца.</p>';
    }

    function masterRail(now) {
      const actors = rows().map(function (row) { return row.actor; });
      const style = "--b-player:" + esc(battle.player || "#3ecf78") + ";--b-foe:" + esc(battle.foe || "#e4533e") + ";--b-brass:" + esc(battle.brass || "#e6c36a");
      return '<div class="battle-screen master-rail" style="' + style + '">' +
        '<p class="fight-round"><span>Раунд</span><b>' + esc(String(battle.round || 1)) + "</b></p>" +
        '<div class="battle-track">' + trackHtml(actors, true, now && now.id, true) + "</div>" +
        bossHtml(actors, true) +
        "</div>";
    }

    function paint() {
      if (!alive) return;
      const now = active();
      const prev = host.querySelector(".battle-sheet");
      const scroll = prev ? prev.scrollTop : 0;
      host.innerHTML = '<div class="battle-desk' + (battle.logOpen ? " is-log" : "") + '">' + masterRail(now) +
        '<section class="battle-sheet">' + toolsHtml(now) +
        '<div class="fight-cast">' + sheetHtml(now) + "</div></section>" +
        (battle.logOpen ? '<aside class="battle-log-pane"><label>Журнал боя<textarea id="battle-log">' + esc(logText(battle.log)) + "</textarea></label></aside>" : "") +
        "</div>";
      const sheet = host.querySelector(".battle-sheet");
      if (sheet) sheet.scrollTop = scroll;
      bind();
      revealActive(host.querySelector(".master-rail"));
      paintClocks();
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

    function openCodexHeroes() {
      const heroes = (book().heroes || []).filter(Boolean);
      const html = heroes.length ? heroes.map(function (hero) {
        const on = (battle.actors || []).some(function (actor) { return actor && actor.heroId === hero.id; });
        return '<button type="button" data-codex-hero="' + esc(hero.id) + '"><b>' + esc(hero.name || "Герой") + "</b><span>" +
          esc((hero.title || "") + (on ? " · уже в бою" : "")) + "</span></button>";
      }).join("") : '<p class="note">В справочнике нет героев. Загрузите лист на вкладке «Герои».</p>';
      openPop("Герой из справочника", '<div class="battle-hits">' + html + "</div>");
    }

    function realArms(actor) {
      return armsOf(actor).filter(function (arm) {
        const name = String(arm.name || "").trim().toLowerCase();
        return name && name !== "атака";
      });
    }

    function openAttackPick(actor) {
      const list = rows().map(function (row) { return row.actor; });
      const html = list.length ? list.map(function (row) {
        const ac = Math.max(0, Math.round(Number(row.ac) || 10));
        const self = row.id === actor.id;
        return '<button type="button" data-target="' + esc(row.id) + '"><b>' + esc(row.name || "—") +
          (self ? " · себя" : "") + (row.dead ? " †" : "") + "</b><span>КД " + ac + "</span></button>";
      }).join("") : '<p class="note">В бою никого нет.</p>';
      const arm = armsOf(actor).find(function (row) { return row.id === actor.armId; }) || armsOf(actor)[0];
      openPop((arm && arm.name) || "Кого бить",
        '<p class="note">Выберите цель. Дальше впишите грань или бросьте к20, затем урон.</p>' +
        '<div class="battle-hits">' + html + "</div>");
      popActorId = actor.id;
    }

    function handVerdict(face, bonus, ac) {
      const die = Math.round(Number(face));
      if (!Number.isFinite(die) || die < 1) return null;
      const total = die + bonus;
      const crit = die >= 20;
      const fumble = die <= 1;
      const hit = crit || (!fumble && total >= ac);
      const sign = bonus > 0 ? "+" + bonus : (bonus < 0 ? String(bonus) : "");
      const math = sign ? die + sign + " = " + total : String(total);
      const word = crit ? "Крит" : (hit ? "Пробил" : "Не пробил");
      return { hit: hit, crit: crit, face: die, text: word + " · " + math + " против КД " + ac };
    }

    function paintVerdict(result) {
      const node = field("strike-verdict");
      if (node) {
        node.textContent = result.text;
        node.className = "strike-verdict " + (result.hit ? "is-hit" : "is-miss");
      }
      if (pop) pop._crit = !!result.crit;
      const rollBtn = pop && pop.querySelector("[data-act='strike-roll']");
      if (rollBtn) rollBtn.textContent = result.crit ? "Бросить урон · крит" : "Бросить урон";
    }

    function openStrike(actor, foe) {
      actor.targetId = foe.id;
      const bonus = Math.round(Number(actor.bonus) || 0);
      const ac = Math.max(0, Math.round(Number(foe.ac) || 10));
      const sign = bonus > 0 ? "+" + bonus : String(bonus);
      const spec = formula(actor.damage || "1d6");
      const dmg = spec.count + "к" + spec.sides + (spec.bonus ? (spec.bonus > 0 ? "+" : "") + spec.bonus : "");
      openPop((actor.weapon || "Атака") + " → " + (foe.name || "цель"),
        '<p class="note">КД ' + ac + " · бонус " + sign + " · урон " + dmg + ". Кубик атаки виден игрокам.</p>" +
        '<label>Кубик<input id="strike-die" type="number" min="1" max="30" inputmode="numeric" aria-label="Грань кубика"></label>' +
        '<button type="button" data-act="strike-read">Проверить</button>' +
        '<button type="button" data-act="strike-throw">Бросить к20</button>' +
        '<p class="strike-verdict" id="strike-verdict">Введите грань или бросьте к20</p>' +
        '<label>Урон<input id="strike-dmg" type="number" min="0" value="0" aria-label="Урон"></label>' +
        '<button type="button" data-act="strike-apply">Снять хиты</button>' +
        '<button type="button" data-act="strike-roll">Бросить урон</button>' +
        '<button type="button" data-act="strike-back">К целям</button>');
      popActorId = actor.id;
      if (pop) {
        pop._foeId = foe.id;
        pop._crit = false;
      }
    }

    const POTIONS = [
      ["2d4+2", "Зелье · 2к4+2"],
      ["4d4+4", "Большое · 4к4+4"],
      ["8d4+8", "Отличное · 8к4+8"],
      ["10d4+20", "Превосходное · 10к4+20"]
    ];

    function openHealPick(actor) {
      const list = rows().map(function (row) { return row.actor; });
      const html = list.length ? list.map(function (row) {
        const self = row.id === actor.id;
        return '<button type="button" data-mend="' + esc(row.id) + '"><b>' + esc(row.name || "—") +
          (self ? " · себя" : "") + (row.dead ? " †" : "") + "</b><span>" +
          (Number(row.hp) || 0) + "/" + (Number(row.hpMax) || 0) + "</span></button>";
      }).join("") : '<p class="note">В бою никого нет.</p>';
      openPop("Кого лечить", '<div class="battle-hits">' + html + "</div>");
      popActorId = actor.id;
    }

    function openHeal(actor, target) {
      const pots = POTIONS.map(function (row) {
        return '<button type="button" data-potion="' + row[0] + '">' + esc(row[1]) + "</button>";
      }).join("");
      openPop("Лечить · " + (target.name || "цель"),
        '<div class="battle-hits">' + pots + "</div>" +
        '<label>Своё число<input id="heal-num" type="number" min="0" value="0" aria-label="Лечение числом"></label>' +
        '<button type="button" data-act="heal-apply">Вылечить</button>' +
        '<button type="button" data-act="heal-back">К целям</button>');
      popActorId = actor.id;
      if (pop) pop._foeId = target.id;
    }

    function openCustomHurt(actor) {
      const list = rows().map(function (row) { return row.actor; });
      const html = list.length ? list.map(function (row) {
        return '<button type="button" data-hurt="' + esc(row.id) + '"><b>' + esc(row.name || "—") +
          (row.id === actor.id ? " · себя" : "") + (row.dead ? " †" : "") + "</b></button>";
      }).join("") : '<p class="note">В бою никого нет.</p>';
      openPop("Свой урон",
        '<label>Формула<input id="custom-damage" type="text" value="' + esc(actor.damage || "1d6") + '" placeholder="2d6+4" aria-label="Формула урона"></label>' +
        '<p class="note">Хиты снимаются сразу, без броска атаки.</p>' +
        '<div class="battle-hits">' + html + "</div>");
      popActorId = actor.id;
    }

    function openFace(actor) {
      openPop("Портрет",
        '<button type="button" data-act="face-lib">Из библиотеки</button>' +
        '<button type="button" data-act="face-file">Загрузить</button>');
      popActorId = actor.id;
    }

    function openInk(actor) {
      const colors = actor.side === "player" ? FOE_INKS.concat(HERO_EXTRA) : FOE_INKS.slice();
      const dots = colors.map(function (color) {
        const on = inkOk(actor.color) && actor.color.toLowerCase() === color.toLowerCase() ? " is-on" : "";
        return '<button type="button" class="ink-dot' + on + '" data-ink="' + color + '" style="background:' + color + '" title="' + color + '"></button>';
      }).join("");
      const custom = actor.side === "player"
        ? '<label>Свой<input id="ink-custom" type="color" value="' + esc(actorInk(actor)) + '" aria-label="Свой цвет"></label>'
        : "";
      openPop("Цвет рамки", '<div class="ink-picks">' + dots + "</div>" + custom);
      popActorId = actor.id;
      const input = pop && pop.querySelector("#ink-custom");
      if (input) input.addEventListener("change", function () {
        const who = popActor();
        if (!who || who.side !== "player" || !inkOk(input.value)) return;
        who.color = input.value;
        save();
        paint();
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
      const home = groupOfActor(actor.id);
      const max = Math.max(1, Math.round(Number(actor.hpMax) || 1));
      const hp = Math.max(0, Math.min(max, Math.round(Number(actor.hp) || 0)));
      openPop(actor.name || "Боец",
        '<button type="button" data-act="life">' + (actor.dead ? "Оживить" : "Убить") + "</button>" +
        '<div class="battle-pair"><label title="Текущие хиты">ХП<input id="pop-hp" type="number" min="0" value="' + hp + '"></label>' +
        '<label title="Максимум хитов">Макс.<input id="pop-hp-max" type="number" min="1" value="' + max + '"></label>' +
        '<label title="Класс доспеха">КД<input id="pop-ac" type="number" min="0" value="' + esc(String(Number(actor.ac) || 10)) + '"></label></div>' +
        '<button type="button" data-act="save-hp" title="Записать хиты и КД">Сохранить</button>' +
        '<details class="pop-fold" open><summary>Отряд</summary>' +
        '<label title="Перенести бойца в другой отряд">Отряд<select id="pop-squad">' + squadOptions(home && home.id) + "</select></label>" +
        '<div class="row"><button type="button" data-act="move-squad" title="Перенести в выбранный отряд">Перенести</button>' +
        '<button type="button" data-act="copy-fighter" title="Скопировать в этот же отряд">Копия</button></div></details>' +
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
          battle.actors.push(actor);
        }
        applyPerson(actor, person);
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
      const label = host.querySelector('.fight-face[data-id="' + actor.id + '"]');
      if (label) {
        const old = label.querySelector(".mark-stack");
        if (old) old.remove();
        const icons = markIcons(actor.marks);
        if (icons) label.insertAdjacentHTML("beforeend", icons);
      }
    }

    function bind() {
      const shown = host.querySelector("#battle-screen");
      if (shown) shown.addEventListener("change", function () {
        battle.screen = shown.checked;
        save();
      });
      const logOn = host.querySelector("#battle-log-on");
      if (logOn) logOn.addEventListener("change", function () {
        battle.logOpen = logOn.checked;
        save();
        paint();
      });
      const turnPause = host.querySelector("#battle-turn-pause");
      if (turnPause) turnPause.addEventListener("change", function () {
        battle.turnPause = turnPause.checked;
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
      const imageOpen = host.querySelector("#battle-image-open");
      if (imageOpen && window.ShirmoShelf) imageOpen.addEventListener("click", function () {
        const lib = window.ShirmoShelf.library();
        window.ShirmoShelf.pick({
          kind: "image",
          images: lib.images || [],
          onPick: function (url) {
            if (!image || !url) return;
            image.value = url;
            image.dispatchEvent(new Event("change"));
          }
        });
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
            if (actor.side !== "player" && !foeInkOk(input.value)) return key;
            actor.color = inkOk(input.value) ? input.value : "";
          } else {
            const next = Math.round(Number(input.value) || 0);
          if (key === "turnSec" && next !== Math.round(Number(actor.turnSec) || 0)) {
            actor.turnRun = false;
            actor.turnUntil = 0;
            actor.turnLeft = 0;
            if (timerOwner === actor.id && window.ShirmoClock && window.ShirmoClock.pause) window.ShirmoClock.pause();
          }
            actor[key] = key === "turnSec" ? Math.max(0, next) : next;
            if (key === "hpMax") actor.hpMax = Math.max(1, actor.hpMax || 1);
            if (key === "hp" || key === "hpMax") setHp(actor, key === "hp" ? actor.hp : actor.hp);
          }
          if (key === "hp" || key === "hpMax") syncPerson(actor, ["hp", "hpMax"]);
          else if (key === "name" || key === "weapon" || key === "damage" || key === "ac") syncPerson(actor, [key]);
          return key;
        }
        if (input.type === "range") {
          input.addEventListener("input", function () {
            apply();
            const cell = input.closest(".hp-cell");
            const read = cell && cell.querySelector("input.hp-read");
            if (read) read.value = input.value;
            const stack = input.closest(".hp-stack");
            const bar = stack && stack.querySelector(".hp-meter i");
            if (bar) {
              const max = Number(input.max) || 1;
              const pct = Math.round(Number(input.value) / max * 100);
              bar.style.width = pct + "%";
              bar.style.background = hpColor(pct);
            }
            const row = input.closest("[data-fighter]");
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
          if (key === "turnSec") paintClocks();
          else if (key !== "name" && key !== "weapon" && key !== "damage") paint();
        });
      });
      host.querySelectorAll("[data-squad-sec]").forEach(function (input) {
        input.addEventListener("change", function () {
          const group = battle.board.find(function (row) { return row.id === input.getAttribute("data-id"); });
          if (!group) return;
          const next = Math.max(0, Math.round(Number(input.value) || 0));
          if (next !== Math.round(Number(group.turnSec) || 0)) {
            group.turnRun = false;
            group.turnUntil = 0;
            group.turnLeft = 0;
            if (timerOwner === group.id && window.ShirmoClock && window.ShirmoClock.pause) window.ShirmoClock.pause();
          }
          group.turnSec = next;
          save();
          paintClocks();
        });
      });
      host.querySelectorAll("[data-turn-fx], [data-squad-fx]").forEach(function (input) {
        input.addEventListener("change", function () {
          const id = input.getAttribute("data-id");
          const row = input.hasAttribute("data-turn-fx")
            ? battle.actors.find(function (actor) { return actor.id === id; })
            : (battle.board || []).find(function (group) { return group.id === id; });
          if (!row) return;
          const kinds = { "": 1, sand: 1, magic: 1, smoke: 1, blizzard: 1, fire: 1, flood: 1 };
          row.turnFx = kinds[input.value] === 1 ? input.value : "";
          save();
          if (timerOwner !== row.id || !row.turnRun || !window.ShirmoFight) return;
          const state = readClock(row);
          window.ShirmoFight({
            seconds: Math.round(Number(row.turnSec) || 0),
            left: state.left,
            running: true,
            kind: row.turnFx,
            showPlayers: true
          });
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
      host.querySelectorAll("[data-move-squad]").forEach(function (input) {
        input.addEventListener("change", function () {
          const actorId = input.getAttribute("data-move-squad");
          const value = input.value;
          if (value === "__new__") {
            const home = groupOfActor(actorId);
            input.value = (home && home.id) || "";
            openNewBattleSquad(actorId);
            return;
          }
          if (!value) {
            input.value = (groupOfActor(actorId) && groupOfActor(actorId).id) || "";
            return;
          }
          moveActorToGroup(actorId, value);
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
      if (act === "turn-toggle" || act === "squad-toggle") {
        const id = button.getAttribute("data-id");
        const row = act === "turn-toggle"
          ? battle.actors.find(function (actor) { return actor.id === id; })
          : (battle.board || []).find(function (group) { return group.id === id; });
        if (row) {
          const field = button.parentElement && button.parentElement.querySelector(act === "turn-toggle" ? "[data-q=turnSec]" : "[data-squad-sec]");
          if (field) row.turnSec = Math.max(0, Math.round(Number(field.value) || 0));
          const fx = button.parentElement && button.parentElement.querySelector("[data-turn-fx], [data-squad-fx]");
          if (fx) row.turnFx = fx.value || "";
          toggleClock(row);
          if (row.turnRun) follow(row);
          else if (timerOwner === row.id && window.ShirmoClock && window.ShirmoClock.pause) window.ShirmoClock.pause();
          save();
          paintClocks();
        }
        return;
      }
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
      if (act === "pull-hp") {
        if (pullBattleFromCodex(true)) {
          save();
          paint();
        }
      }
      if (act === "foe-face") {
        const actor = battle.actors.find(function (row) { return row.id === button.getAttribute("data-id"); });
        if (!actor || !window.ShirmoCodex || !window.ShirmoCodex.pickMonsterFace) return;
        window.ShirmoCodex.pickMonsterFace(function (url) {
          actor.portrait = url;
          syncPerson(actor, ["portrait"]);
          save();
          paint();
        }, book().npcs);
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
      if (act === "squad-del") {
        dropSquadFromBattle(button.getAttribute("data-id"));
      }
      if (act === "drop-fighter") {
        dropFighter(button.getAttribute("data-id"));
      }
      if (act === "life") {
        const actor = battle.actors.find(function (row) { return row.id === button.getAttribute("data-id"); });
        if (actor) toggleLife(actor);
      }
      if (act === "copy-fighter") {
        cloneActorInGroup(button.getAttribute("data-id"));
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
        popX = box.left;
        popY = box.bottom + 6;
        openAttackPick(actor);
      }
      if (act === "arm-hit") {
        const actor = battle.actors.find(function (row) { return row.id === button.getAttribute("data-id"); });
        const arm = actor && armsOf(actor).find(function (row) { return row.id === button.getAttribute("data-arm"); });
        if (!actor || !arm) return;
        useArm(actor, arm);
        actor.armId = arm.id;
        const box = button.getBoundingClientRect();
        popX = box.left;
        popY = box.bottom + 6;
        openAttackPick(actor);
      }
      if (act === "custom-hurt") {
        const actor = battle.actors.find(function (row) { return row.id === button.getAttribute("data-id"); });
        if (!actor) return;
        const box = button.getBoundingClientRect();
        popX = box.left;
        popY = box.bottom + 6;
        openCustomHurt(actor);
      }
      if (act === "heal") {
        const actor = battle.actors.find(function (row) { return row.id === button.getAttribute("data-id"); });
        if (!actor) return;
        const box = button.getBoundingClientRect();
        popX = box.left;
        popY = box.bottom + 6;
        openHealPick(actor);
      }
      if (act === "face-turn") {
        const actor = battle.actors.find(function (row) { return row.id === button.getAttribute("data-id"); });
        if (!actor) return;
        selectActor(actor);
        save();
        paint();
      }
      if (act === "pick-face") {
        const actor = battle.actors.find(function (row) { return row.id === button.getAttribute("data-id"); });
        if (!actor) return;
        const box = button.getBoundingClientRect();
        popX = box.left;
        popY = box.bottom + 6;
        openFace(actor);
      }
      if (act === "pick-ink") {
        const actor = battle.actors.find(function (row) { return row.id === button.getAttribute("data-id"); });
        if (!actor) return;
        const box = button.getBoundingClientRect();
        popX = box.left;
        popY = box.bottom + 6;
        openInk(actor);
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
      const heroBtn = event.target.closest("[data-codex-hero]");
      if (heroBtn && pop && pop.contains(heroBtn)) {
        const hero = (book().heroes || []).find(function (row) { return row && row.id === heroBtn.getAttribute("data-codex-hero"); });
        if (hero) {
          placeHero(ctx.campaign, hero);
          assignInks(battle);
          closePop();
          save();
          paint();
        }
        return;
      }
      const targetBtn = event.target.closest("[data-target]");
      if (targetBtn && pop && pop.contains(targetBtn)) {
        const actor = popActor();
        const foe = battle.actors.find(function (row) { return row.id === targetBtn.getAttribute("data-target"); });
        if (!actor || !foe) return;
        openStrike(actor, foe);
        return;
      }
      const hurtBtn = event.target.closest("[data-hurt]");
      if (hurtBtn && pop && pop.contains(hurtBtn)) {
        const actor = popActor();
        const foe = battle.actors.find(function (row) { return row.id === hurtBtn.getAttribute("data-hurt"); });
        const typed = field("custom-damage");
        if (!actor || !foe) return;
        actor.targetId = foe.id;
        const text = (typed && typed.value) || actor.damage || "1d6";
        closePop();
        damage(actor, true, false, text);
        return;
      }
      const inkBtn = event.target.closest("[data-ink]");
      if (inkBtn && pop && pop.contains(inkBtn)) {
        const actor = popActor();
        const color = inkBtn.getAttribute("data-ink");
        if (!actor || !inkOk(color)) return;
        if (actor.side !== "player" && !foeInkOk(color)) return;
        actor.color = color;
        closePop();
        save();
        paint();
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
        if (!actor.damage) actor.damage = "1d" + sides;
        attack(actor);
        return;
      }
      const mendBtn = event.target.closest("[data-mend]");
      if (mendBtn && pop && pop.contains(mendBtn)) {
        const actor = popActor();
        const target = battle.actors.find(function (row) { return row.id === mendBtn.getAttribute("data-mend"); });
        if (actor && target) openHeal(actor, target);
        return;
      }
      const potionBtn = event.target.closest("[data-potion]");
      if (potionBtn && pop && pop.contains(potionBtn)) {
        const actor = popActor();
        const target = battle.actors.find(function (row) { return row.id === pop._foeId; });
        if (!actor || !target) return;
        const rolled = boneRoll(potionBtn.getAttribute("data-potion"), false);
        closePop();
        giveLife(actor, target, rolled.total, (actor.name || "Боец") + " лечит " + (target.name || "цель") + " · " + boneText(rolled));
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
      if (act === "strike-read" && actor && pop) {
        const foe = battle.actors.find(function (row) { return row.id === pop._foeId; });
        const node = field("strike-verdict");
        const die = field("strike-die");
        if (!foe || !node) return;
        const typed = Math.round(Number(die && die.value));
        if (!Number.isFinite(typed) || typed < 1) {
          node.textContent = "Введите грань кубика";
          node.className = "strike-verdict";
          return;
        }
        castCheck(actor, foe, Math.min(20, typed));
      }
      if (act === "strike-apply" && actor && pop) {
        const foe = battle.actors.find(function (row) { return row.id === pop._foeId; });
        if (!foe) return;
        const dmg = Math.max(0, Math.round(Number(field("strike-dmg") && field("strike-dmg").value) || 0));
        if (!foe || dmg <= 0) return;
        actor.targetId = foe.id;
        closePop();
        takeHurt(actor, foe, dmg, (actor.name || "Боец") + " наносит " + (foe.name || "цели"));
      }
      if (act === "strike-roll" && actor && pop) {
        const foe = battle.actors.find(function (row) { return row.id === pop._foeId; });
        if (!foe) return;
        const crit = !!pop._crit;
        actor.targetId = foe.id;
        const rolled = boneRoll(actor.damage || "1d6", crit);
        closePop();
        takeHurt(actor, foe, rolled.total, (actor.name || "Боец") + " → " + (foe.name || "цель") + " · " + boneText(rolled));
      }
      if (act === "strike-throw" && actor && pop) {
        const foe = battle.actors.find(function (row) { return row.id === pop._foeId; });
        if (!foe) return;
        actor.targetId = foe.id;
        castCheck(actor, foe, null);
      }
      if (act === "heal-apply" && actor && pop) {
        const target = battle.actors.find(function (row) { return row.id === pop._foeId; });
        if (!target) return;
        const n = Math.max(0, Math.round(Number(field("heal-num") && field("heal-num").value) || 0));
        if (!target || n <= 0) return;
        closePop();
        giveLife(actor, target, n, (actor.name || "Боец") + " лечит " + (target.name || "цель"));
      }
      if (act === "heal-back" && actor) openHealPick(actor);
      if (act === "face-lib" && actor) {
        const who = actor;
        const lib = ctx.library ? ctx.library() : (ctx.campaign && ctx.campaign.library);
        closePop();
        if (!window.ShirmoShelf) return;
        window.ShirmoShelf.pick({
          kind: "image",
          images: (lib && lib.images) || [],
          onPick: function (url) {
            if (!url) return;
            who.portrait = url;
            syncPerson(who, ["portrait"]);
            save();
            paint();
          }
        });
      }
      if (act === "face-file" && actor) {
        const input = host.querySelector('[data-face="' + actor.id + '"]');
        closePop();
        if (input) input.click();
      }
      if (act === "strike-back" && actor) openAttackPick(actor);
      if (act === "wound" && actor) {
        chosenArm(actor);
        damage(actor, true);
      }
      if (act === "life" && actor) toggleLife(actor);
      if (act === "save-hp" && actor) {
        const maxField = field("pop-hp-max");
        const hpField = field("pop-hp");
        const acField = field("pop-ac");
        actor.hpMax = Math.max(1, Math.round(Number(maxField && maxField.value) || actor.hpMax || 1));
        actor.ac = Math.max(0, Math.round(Number(acField && acField.value) || 10));
        setHp(actor, Number(hpField && hpField.value));
        syncPerson(actor, ["hp", "hpMax", "ac"]);
        save();
        paint();
        openFighter(actor);
      }
      if (act === "copy-fighter" && actor) {
        cloneActorInGroup(actor.id);
        closePop();
      }
      if (act === "make-squad" && actor) {
        const name = (field("new-squad-name") && field("new-squad-name").value || "").trim() || actor.name || "Отряд";
        moveActorToGroup(actor.id, "", name);
        closePop();
      }
      if (act === "move-squad" && actor) {
        const pick = field("pop-squad");
        const value = pick ? pick.value : "";
        if (value === "__new__") {
          openNewBattleSquad(actor.id);
          return;
        }
        if (!value) {
          closePop();
          return;
        }
        moveActorToGroup(actor.id, value);
        closePop();
      }
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
    window.ShirmoBattle.sync = function () {
      if (!alive || !host.isConnected) return;
      paint();
    };
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
      clearInterval(turnBeat);
      if (window.ShirmoBattle) window.ShirmoBattle.sync = null;
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
    if (pullBattleFromCodex(false)) save();
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

  function turnMark(actor, withTime) {
    if (!withTime) return "";
    const sec = Math.max(0, Math.round(Number(actor && actor.turnSec) || 0));
    if (!sec) return "";
    return '<span class="token-time" data-actor="' + esc(actor.id) + '"></span>';
  }

  function clockText(ms) {
    const total = Math.max(0, Math.ceil(Number(ms) / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return minutes + ":" + String(seconds).padStart(2, "0");
  }

  function refreshTurnClocks(root) {
    if (!root) return;
    const clock = window.ShirmoClock && window.ShirmoClock.read ? window.ShirmoClock.read() : null;
    root.querySelectorAll(".token-time").forEach(function (node) {
      const sec = Number(node.getAttribute("data-budget")) || 0;
      const budget = clockText(sec * 1000);
      const on = !!node.closest(".active");
      node.textContent = on && clock && clock.running ? budget + " / " + clockText(clock.left) : budget;
    });
  }

  function trackHtml(actors, clickable, activeId, withTime) {
    if (!actors.length) return '<p class="note">Бой пуст.</p>';
    return groupsOf(actors).map(function (group) {
      const tokens = group.actors.map(function (actor) {
        const on = activeId ? actor.id === activeId : !!actor.active;
        const side = actor.side === "player" ? "player" : "npc";
        const cls = "battle-token " + side + (on ? " active" : "") + (actor.dead ? " dead" : "");
        const inner = '<span class="battle-face">' + faceOf(actor) + '</span>' + markUnder(actor.marks) + '<span class="token-name">' + esc(actor.name || "—") + "</span>" + turnMark(actor, withTime);
        if (!clickable) return '<div class="' + cls + '">' + inner + "</div>";
        return '<button type="button" class="' + cls + '" data-go="' + esc(actor.id) + '" title="Ход: ' + esc(actor.name || "") + '">' + inner + "</button>";
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

  function panPort(root) {
    return root && root.querySelector(".play-battle .battle-stage");
  }

  function revealActive(root) {
    if (!root) return;
    const port = panPort(root) || root.querySelector(".battle-track");
    const home = root.querySelector(".play-battle") || root;
    const token = home.querySelector(".battle-token.active");
    if (!port || !token) return;
    const box = token.getBoundingClientRect();
    const rail = port.getBoundingClientRect();
    const scale = rail.width / (port.offsetWidth || 1) || 1;
    port.scrollLeft += (box.left - rail.left - rail.width / 2 + box.width / 2) / scale;
    port.scrollTop += (box.top - rail.top - rail.height / 2 + box.height / 2) / scale;
  }

  function bindPan(root) {
    if (!root || root._battlePan) return;
    root._battlePan = true;
    root._battleHold = { left: 0, top: 0, active: null };
    let drag = null;
    root.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      const screen = event.target.closest && event.target.closest(".play-battle");
      if (!screen || !root.contains(screen)) return;
      const port = screen.querySelector(".battle-stage");
      if (!port) return;
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: port.scrollLeft,
        top: port.scrollTop,
        moved: false,
        port: port
      };
    });
    window.addEventListener("pointermove", function (event) {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && (dx * dx + dy * dy) < 36) return;
      const port = drag.port;
      if (!port.isConnected) return;
      if (!drag.moved && port.setPointerCapture) port.setPointerCapture(event.pointerId);
      drag.moved = true;
      const screen = port.closest(".play-battle");
      if (screen) screen.classList.add("is-panning");
      const rect = port.getBoundingClientRect();
      const scale = rect.width / (port.offsetWidth || 1) || 1;
      port.scrollLeft = drag.left - dx / scale;
      port.scrollTop = drag.top - dy / scale;
      root._battleHold.left = port.scrollLeft;
      root._battleHold.top = port.scrollTop;
    });
    function endPan(event) {
      if (!drag || (event && event.pointerId !== drag.id)) return;
      const moved = drag.moved;
      drag = null;
      const screen = root.querySelector(".play-battle");
      if (screen) screen.classList.remove("is-panning");
      if (!moved) return;
      root._panSuppress = true;
      setTimeout(function () { root._panSuppress = false; }, 80);
    }
    window.addEventListener("pointerup", endPan);
    window.addEventListener("pointercancel", endPan);
    root.addEventListener("click", function (event) {
      if (!root._panSuppress) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  function restorePan(root) {
    const port = panPort(root);
    const hold = root && root._battleHold;
    if (!port || !hold) return;
    port.scrollLeft = hold.left;
    port.scrollTop = hold.top;
  }

  function screenHtml(actors, active, log, clickable, showHp, round) {
    const head = '<p class="fight-round"><span>Раунд</span><b>' + esc(String(round || 1)) + "</b></p>";
    return head + '<div class="battle-stage"><div class="battle-track">' + trackHtml(actors, clickable, active && active.id) + "</div>" +
      bossHtml(actors, !!showHp) + "</div>";
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
      screenHtml(actors, active, page.log, true, false, page.round) + "</div>";
  }

  function placeHero(campaign, hero) {
    if (!campaign || !hero) return null;
    const battle = ensure(campaign);
    let actor = (battle.actors || []).find(function (row) { return row && row.heroId === hero.id; });
    if (!actor) {
      actor = blank("player");
      actor.heroId = hero.id;
      actor.codexId = "";
      battle.actors.push(actor);
    }
    actor.name = hero.name || "Герой";
    actor.side = "player";
    actor.hpMax = Math.max(1, Math.round(Number(hero.hpMax) || Number(hero.hp) || 1));
    actor.hp = Math.max(0, Math.min(actor.hpMax, Math.round(hero.hp == null ? actor.hpMax : Number(hero.hp))));
    actor.dead = actor.hp <= 0;
    actor.ac = Math.max(0, Math.round(Number(hero.ac) || 10));
    actor.initBonus = Math.round(Number(hero.init) || 0);
    actor.portrait = hero.portrait || "";
    actor.note = hero.title || "";
    actor.codexId = "";
    const attacks = (hero.attacks || []).filter(function (arm) { return arm && arm.name; });
    if (attacks.length) {
      actor.weapons = attacks.map(function (arm) {
        return {
          id: crypto.randomUUID(),
          name: arm.name,
          damage: arm.damage || "1d6",
          bonus: Math.round(Number(arm.bonus) || 0)
        };
      });
      actor.armId = actor.weapons[0].id;
      actor.weapon = actor.weapons[0].name;
      actor.damage = actor.weapons[0].damage;
      actor.bonus = actor.weapons[0].bonus;
    }
    let group = (battle.board || []).find(function (row) {
      return row && row.kind !== "sep" && row.name === "Герои";
    });
    if (!group) {
      group = { id: crypto.randomUUID(), kind: "squad", name: "Герои", memberIds: [] };
      battle.board.unshift(group);
    }
    battle.board.forEach(function (row) {
      if (!row || row === group || !row.memberIds) return;
      row.memberIds = row.memberIds.filter(function (id) { return id !== actor.id; });
    });
    if (group.memberIds.indexOf(actor.id) < 0) group.memberIds.push(actor.id);
    battle.board = battle.board.filter(function (row) {
      return row && (row.kind === "sep" || row === group || (row.memberIds && row.memberIds.length));
    });
    return actor;
  }

  function removeHero(campaign, heroId) {
    if (!campaign || !heroId) return false;
    const battle = ensure(campaign);
    const actor = (battle.actors || []).find(function (row) { return row && row.heroId === heroId; });
    if (!actor) return false;
    const markerIds = actor.markerId ? [actor.markerId] : [];
    if (markerIds.length) {
      (campaign.pages || []).forEach(function (page) {
        (page.views || []).forEach(function (view) {
          view.markers = (view.markers || []).filter(function (row) { return !(row && markerIds.indexOf(row.id) >= 0); });
          (view.locations || []).forEach(function (loc) {
            if (!loc || !loc.markers) return;
            loc.markers = loc.markers.filter(function (row) { return !(row && markerIds.indexOf(row.id) >= 0); });
          });
        });
      });
    }
    battle.actors = (battle.actors || []).filter(function (row) { return !(row && row.id === actor.id); });
    (battle.board || []).forEach(function (group) {
      if (!group || !group.memberIds) return;
      group.memberIds = group.memberIds.filter(function (id) { return id !== actor.id; });
    });
    battle.board = (battle.board || []).filter(function (row) {
      return row && (row.kind === "sep" || (row.memberIds && row.memberIds.length));
    });
    const ordered = battle.actors.map(function (row, index) { return { actor: row, index: index }; }).sort(function (a, b) {
      const diff = (Number(b.actor.init) || 0) - (Number(a.actor.init) || 0);
      return diff || a.index - b.index;
    });
    if (ordered.length) battle.turn = Math.min(Number(battle.turn) || 0, ordered.length - 1);
    else battle.turn = 0;
    return true;
  }

  window.ShirmoBattle = {
    mount: mount,
    ensure: ensure,
    formula: formula,
    playerHtml: playerHtml,
    revealActive: revealActive,
    bindPan: bindPan,
    restorePan: restorePan,
    placeHero: placeHero,
    removeHero: removeHero
  };
})();
