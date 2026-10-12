(function () {
  const MARKS = [
    ["down", "Сбит"],
    ["fear", "Страх"],
    ["focus", "Концентрация"]
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

  function ensure(campaign) {
    const prev = campaign.battle || {};
    if (!campaign.battle || !Array.isArray(campaign.battle.actors)) campaign.battle = prev;
    const battle = campaign.battle;
    if (!battle.bg) battle.bg = "#14110e";
    if (!battle.ink) battle.ink = "#f3ead8";
    if (!battle.player) battle.player = "#7dcea0";
    if (!battle.foe) battle.foe = "#e07a6a";
    if (!battle.brass) battle.brass = "#e6c36a";
    if (!battle.image) battle.image = "";
    if (!Number.isFinite(Number(battle.round)) || Number(battle.round) < 1) battle.round = 1;
    if (!Number.isFinite(Number(battle.turn))) battle.turn = 0;
    battle.actors = Array.isArray(battle.actors) ? battle.actors : [];
    battle.log = Array.isArray(battle.log) ? battle.log : [];
    return battle;
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
      battle.log = battle.log.slice(0, 8);
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
        if (total != null) note((spec.name || "Бросок") + ": " + total);
        save();
        paint();
        return data;
      });
    }

    function attack(actor) {
      roll({
        name: actor.name || "Боец",
        label: actor.weapon || "Атака",
        count: 1,
        sides: 20,
        bonus: Number(actor.bonus) || 0
      });
    }

    function damage(actor, apply) {
      const spec = formula(actor.damage || "1d6");
      roll({
        name: actor.name || "Боец",
        label: "Урон",
        count: spec.count,
        sides: spec.sides,
        bonus: spec.bonus
      }).then(function (data) {
        const total = data && data.event && data.event.roll ? Number(data.event.roll.total) : 0;
        actor.lastDamage = total;
        if (apply && total) {
          const foe = currentFoe(actor);
          if (foe) setHp(foe, (Number(foe.hp) || 0) - total);
        }
        save();
        paint();
      });
    }

    function currentFoe(from) {
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
      const box = host.querySelector(".battle-hits");
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

    function paint() {
      if (!alive) return;
      const list = rows();
      const now = active();
      const images = (ctx.library && ctx.library().images) || [];
      const bg = ' style="--b-bg:' + esc(battle.bg) + ";--b-ink:" + esc(battle.ink) + ";--b-player:" + esc(battle.player) + ";--b-foe:" + esc(battle.foe) + ";--b-brass:" + esc(battle.brass) + ";" +
        (battle.image ? "background-image:linear-gradient(rgba(7,9,14,.55), rgba(7,9,14,.72)),url('" + esc(battle.image) + "')" : "") + '"';
      host.innerHTML = '<div class="battle"' + bg + ">" +
        '<aside class="battle-side">' + sideHtml(images) + "</aside>" +
        '<div class="battle-main"><div class="battle-track">' + (list.length ? list.map(function (row, index) {
          return tokenHtml(row.actor, index, now && row.actor.id === now.id, list);
        }).join("") : '<p class="note">Бой пуст. Добавьте героев и врагов слева.</p>') +
        "</div>" + cardHtml(now) + "</div></div>";
      bind();
    }

    function sideHtml(images) {
      const options = '<option value="">Без картинки</option>' + images.map(function (image) {
        return '<option value="' + esc(image.url) + '"' + (image.url === battle.image ? " selected" : "") + ">" + esc(image.name || "Картинка") + "</option>";
      }).join("");
      return '<p class="battle-round">Раунд ' + esc(String(battle.round || 1)) + "</p>" +
        '<div class="row"><button type="button" data-act="prev" title="Предыдущий живой ход">Назад</button><button type="button" data-act="next" title="Следующий живой ход">Дальше</button></div>' +
        '<button type="button" data-act="init" title="Бросить инициативу всем, у кого она ещё не задана вручную после этого">Инициатива всем</button>' +
        '<button type="button" data-act="place" title="Поставить врагов на текущую карту. Игроки их не видят, пока не снимете скрытие">Враги на карту</button>' +
        '<label title="Имя героя">Герой<input id="battle-hero" type="text" placeholder="Имя"></label>' +
        '<button type="button" data-act="hero" title="Добавить героя пятого уровня с типовыми хитами">Добавить героя</button>' +
        '<label title="Поиск в справочнике монстров">Из справочника<input id="battle-find" type="text" value="' + esc(query) + '" placeholder="Бандит" aria-label="Поиск монстра"></label>' +
        '<div class="battle-hits"' + (hits.length ? "" : " hidden") + ">" + hits.map(function (row, index) {
          return '<button type="button" data-monster="' + index + '">' + esc(String(row.name || "").replace(/\s*\([^)]*\)\s*$/, "")) + "</button>";
        }).join("") + "</div>" +
        '<label title="Сколько копий из справочника">Сколько<input id="battle-count" type="number" min="1" max="12" value="1"></label>' +
        '<p class="note">Свой враг</p>' +
        '<label>Имя<input id="ogre-name" type="text" value="' + esc(custom.name) + '"></label>' +
        '<div class="battle-pair"><label>Хиты<input id="ogre-hp" type="number" min="1" value="' + esc(String(custom.hp)) + '"></label>' +
        '<label>КД<input id="ogre-ac" type="number" min="1" value="' + esc(String(custom.ac)) + '"></label></div>' +
        '<label>Оружие<input id="ogre-weapon" type="text" value="' + esc(custom.weapon) + '"></label>' +
        '<div class="battle-pair"><label>Атака<input id="ogre-bonus" type="number" value="' + esc(String(custom.bonus)) + '"></label>' +
        '<label>Урон<input id="ogre-damage" type="text" value="' + esc(custom.damage) + '"></label></div>' +
        '<button type="button" data-act="custom" title="Добавить своего врага в трек">Добавить врага</button>' +
        '<details class="drop"><summary title="Фон трека и цвета жетонов">Фон и цвета</summary>' +
        '<label>Фон<input id="battle-bg" type="color" value="' + esc(battle.bg) + '"></label>' +
        '<label>Картинка<select id="battle-image">' + options + "</select></label>" +
        '<label>Текст<input id="battle-ink" type="color" value="' + esc(battle.ink) + '"></label>' +
        '<label>Герои<input id="battle-player" type="color" value="' + esc(battle.player) + '"></label>' +
        '<label>Враги<input id="battle-foe" type="color" value="' + esc(battle.foe) + '"></label>' +
        '<label>Активный<input id="battle-brass" type="color" value="' + esc(battle.brass) + '"></label></details>' +
        (battle.log.length ? '<div class="battle-log">' + battle.log.map(function (line) { return "<p>" + esc(line) + "</p>"; }).join("") + "</div>" : "");
    }

    function tokenHtml(actor, index, on, list) {
      const prev = index > 0 ? list[index - 1].actor : null;
      const tie = prev && Number(prev.init) === Number(actor.init);
      const ratio = actor.hpMax ? Math.max(0, Math.min(1, (Number(actor.hp) || 0) / actor.hpMax)) : 0;
      const face = actor.portrait ? '<img alt="" src="' + esc(actor.portrait) + '">' : "<b>" + esc((actor.name || "?").slice(0, 1)) + "</b>";
      const marks = (actor.marks || []).map(function (id) {
        const row = MARKS.find(function (item) { return item[0] === id; });
        return row ? "<i>" + esc(row[1]) + "</i>" : "";
      }).join("");
      return '<button type="button" class="battle-token' + (on ? " is-on" : "") + (actor.dead ? " is-dead" : "") + (tie ? " is-tie" : "") + " is-" + (actor.side === "player" ? "player" : "foe") + '" data-go="' + esc(actor.id) + '" title="' + esc(actor.name || "") + '">' +
        '<span class="battle-face">' + face + "</span>" +
        "<strong>" + esc(actor.name || "Боец") + "</strong>" +
        '<em class="battle-init">' + esc(String(actor.init || 0)) + "</em>" +
        '<span class="battle-bar"><span style="width:' + Math.round(ratio * 100) + '%"></span></span>' +
        '<em class="battle-hp">' + esc(String(actor.hp)) + "/" + esc(String(actor.hpMax)) + " · КД " + esc(String(actor.ac || 0)) + "</em>" +
        (marks ? '<span class="battle-marks">' + marks + "</span>" : "") +
        "</button>";
    }

    function targetOptions(actor) {
      const list = battle.actors.filter(function (row) { return row.id !== actor.id && !row.dead; });
      return '<option value="">Следующий напротив</option>' + list.map(function (row) {
        return '<option value="' + esc(row.id) + '"' + (row.id === actor.targetId ? " selected" : "") + ">" + esc(row.name || "Боец") + "</option>";
      }).join("");
    }

    function cardHtml(actor) {
      if (!actor) return '<div class="battle-card note">Выберите бойца или добавьте нового.</div>';
      const marks = MARKS.map(function (item) {
        const on = (actor.marks || []).indexOf(item[0]) >= 0;
        return '<button type="button" data-mark="' + item[0] + '" class="' + (on ? "is-on" : "") + '">' + item[1] + "</button>";
      }).join("");
      return '<form class="battle-card" data-id="' + esc(actor.id) + '">' +
        '<div class="battle-card-head"><button type="button" class="battle-name" data-act="attack" title="Бросок атаки от этого имени. Игроки видят кубик">' + esc(actor.name || "Боец") + "</button>" +
        '<button type="button" data-act="hurt" title="Бросок урона. Игроки видят кубик">Урон ' + esc(actor.damage || "") + "</button>" +
        '<label class="battle-target" title="Кого ударит кнопка «В хиты»">Цель<select name="target">' + targetOptions(actor) + "</select></label>" +
        '<button type="button" data-act="apply" title="Вычесть последний урон из хитов выбранной цели">В хиты' + (actor.lastDamage ? " " + esc(String(actor.lastDamage)) : "") + "</button>" +
        '<button type="button" data-act="drop" title="Убрать из боя">×</button></div>' +
        '<div class="battle-grid">' +
        '<label>Имя<input name="name" type="text" value="' + esc(actor.name || "") + '"></label>' +
        '<label>Инициатива<input name="init" type="number" value="' + esc(String(actor.init || 0)) + '"></label>' +
        '<label>Хиты<input name="hp" type="number" min="0" value="' + esc(String(actor.hp)) + '"></label>' +
        '<label>Макс.<input name="hpMax" type="number" min="1" value="' + esc(String(actor.hpMax || 1)) + '"></label>' +
        '<label>КД<input name="ac" type="number" min="0" value="' + esc(String(actor.ac || 0)) + '"></label>' +
        '<label>Атака<input name="bonus" type="number" value="' + esc(String(actor.bonus || 0)) + '"></label>' +
        '<label>Оружие<input name="weapon" type="text" value="' + esc(actor.weapon || "") + '"></label>' +
        '<label>Урон<input name="damage" type="text" value="' + esc(actor.damage || "") + '"></label>' +
        "</div>" +
        '<div class="row battle-hp-row"><button type="button" data-hp="-5">−5</button><button type="button" data-hp="-1">−1</button><button type="button" data-hp="1">+1</button><button type="button" data-hp="5">+5</button></div>' +
        '<div class="row">' + marks + "</div>" +
        '<label>Заметка<input name="note" type="text" value="' + esc(actor.note || "") + '" placeholder="Только вам"></label>' +
        "</form>";
    }

    function readCard() {
      const form = host.querySelector(".battle-card");
      if (!form || !form.dataset.id) return null;
      const actor = battle.actors.find(function (row) { return row.id === form.dataset.id; });
      if (!actor) return null;
      ["name", "weapon", "damage", "note"].forEach(function (key) {
        const input = form.elements[key];
        if (input) actor[key] = input.value;
      });
      if (form.elements.target) actor.targetId = form.elements.target.value;
      ["init", "hp", "hpMax", "ac", "bonus"].forEach(function (key) {
        const input = form.elements[key];
        if (input) actor[key] = Math.round(Number(input.value) || 0);
      });
      actor.hpMax = Math.max(1, actor.hpMax || 1);
      setHp(actor, actor.hp);
      return actor;
    }

    function readCustom() {
      custom = {
        name: (host.querySelector("#ogre-name") || {}).value || "Враг",
        hp: Math.max(1, Math.round(Number((host.querySelector("#ogre-hp") || {}).value) || 1)),
        ac: Math.max(1, Math.round(Number((host.querySelector("#ogre-ac") || {}).value) || 10)),
        bonus: Math.round(Number((host.querySelector("#ogre-bonus") || {}).value) || 0),
        damage: (host.querySelector("#ogre-damage") || {}).value || "1d6",
        weapon: (host.querySelector("#ogre-weapon") || {}).value || "Атака",
        count: 1
      };
    }

    function bind() {
      const find = host.querySelector("#battle-find");
      if (find) find.addEventListener("input", function () { search(find.value); });
      host.querySelectorAll("[data-go]").forEach(function (button) {
        button.addEventListener("click", function () {
          const actor = battle.actors.find(function (row) { return row.id === button.getAttribute("data-go"); });
          if (!actor) return;
          selectActor(actor);
          save();
          paint();
        });
      });
      const form = host.querySelector(".battle-card");
      if (form && form.addEventListener) {
        form.addEventListener("change", function (event) {
          readCard();
          save();
          if (!event.target || event.target.type !== "text") paint();
        });
        form.addEventListener("submit", function (event) { event.preventDefault(); });
        form.querySelectorAll("[data-hp]").forEach(function (button) {
          button.addEventListener("click", function () {
            const actor = readCard();
            if (!actor) return;
            setHp(actor, (Number(actor.hp) || 0) + Number(button.getAttribute("data-hp")));
            save();
            paint();
          });
        });
        form.querySelectorAll("[data-mark]").forEach(function (button) {
          button.addEventListener("click", function () {
            const actor = readCard();
            if (!actor) return;
            const id = button.getAttribute("data-mark");
            actor.marks = actor.marks || [];
            const at = actor.marks.indexOf(id);
            if (at >= 0) actor.marks.splice(at, 1);
            else actor.marks.push(id);
            save();
            paint();
          });
        });
      }
      ["#battle-bg", "#battle-ink", "#battle-player", "#battle-foe", "#battle-brass"].forEach(function (sel) {
        const input = host.querySelector(sel);
        if (!input) return;
        input.addEventListener("input", function () {
          const key = sel.slice(8);
          battle[key] = input.value;
          host.querySelector(".battle").style.setProperty("--b-" + (key === "bg" ? "bg" : key), input.value);
          save();
        });
      });
      const image = host.querySelector("#battle-image");
      if (image) image.addEventListener("change", function () {
        battle.image = image.value;
        save();
        paint();
      });
    }

    function onClick(event) {
      const monsterBtn = event.target.closest("[data-monster]");
      if (monsterBtn && host.contains(monsterBtn)) {
        const monster = hits[Number(monsterBtn.getAttribute("data-monster"))];
        if (!monster) return;
        const count = Math.min(12, Math.max(1, Number((host.querySelector("#battle-count") || {}).value) || 1));
        addCopies(fromMonster(monster), count);
        return;
      }
      const button = event.target.closest("[data-act]");
      if (!button || !host.contains(button)) return;
      const act = button.getAttribute("data-act");
      if (act === "next") step(1);
      if (act === "prev") step(-1);
      if (act === "hero") {
        const name = (host.querySelector("#battle-hero") || {}).value;
        const actor = blank("player");
        if (name && name.trim()) actor.name = name.trim();
        actor.note = "5 уровень";
        battle.actors.push(actor);
        save();
        paint();
      }
      if (act === "custom") {
        readCustom();
        const actor = blank("foe");
        actor.name = custom.name;
        actor.hp = custom.hp;
        actor.hpMax = custom.hp;
        actor.ac = custom.ac;
        actor.bonus = custom.bonus;
        actor.damage = custom.damage;
        actor.weapon = custom.weapon;
        actor.initBonus = 0;
        battle.actors.push(actor);
        save();
        paint();
      }
      if (act === "place") {
        readCard();
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
        note("Инициатива брошена на ширме");
        save();
        paint();
      }
      if (act === "attack") {
        const actor = readCard();
        if (actor) attack(actor);
      }
      if (act === "hurt") {
        const actor = readCard();
        if (actor) damage(actor, false);
      }
      if (act === "apply") {
        const actor = readCard();
        const form = host.querySelector(".battle-card");
        const picked = form && form.elements.target ? form.elements.target.value : "";
        const foe = (picked && battle.actors.find(function (row) { return row.id === picked; })) || (actor && currentFoe(actor));
        if (actor && foe && actor.lastDamage) {
          setHp(foe, (Number(foe.hp) || 0) - Number(actor.lastDamage));
          note(actor.name + " бьёт " + foe.name + " на " + actor.lastDamage);
          save();
          paint();
        }
      }
      if (act === "drop") {
        const actor = readCard();
        if (!actor) return;
        battle.actors = battle.actors.filter(function (row) { return row.id !== actor.id; });
        battle.turn = 0;
        save();
        paint();
      }
    }

    host.addEventListener("click", onClick);
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
        battle.actors.push(actor);
      }
      selectActor(actor);
      save();
      paint();
    };
    host._battleOff = function () { alive = false; host.removeEventListener("click", onClick); };
    loadMonsters().then(function () { if (alive) paint(); });
    paint();
  }

  window.ShirmoBattle = { mount: mount, ensure: ensure, formula: formula };
})();
