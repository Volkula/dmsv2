window.ShirmoCodex = (function () {
  function icon(body) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + body + "</svg>";
  }

  const D6 = icon('<rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="1.15" fill="currentColor"/><circle cx="16" cy="8" r="1.15" fill="currentColor"/><circle cx="8" cy="12" r="1.15" fill="currentColor"/><circle cx="16" cy="12" r="1.15" fill="currentColor"/><circle cx="8" cy="16" r="1.15" fill="currentColor"/><circle cx="16" cy="16" r="1.15" fill="currentColor"/>');
  const FACE = icon('<circle cx="12" cy="9" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 19c1.2-3 3.2-4.5 6-4.5S16.8 16 18 19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>');
  const SCENE = icon('<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8.5" cy="10" r="1.4" fill="currentColor"/><path d="M3 16l5-4 4 3 3-2 6 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>');

  const PERSON = [["name", "Имя", "text"], ["note", "Заметка", "text"], ["weapon", "Оружие", "text"], ["damage", "Урон", "text"], ["hp", "ХП", "number"], ["hpMax", "Макс", "number"]];
  const TABS = [
    ["places", "Места", icon('<path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="11" r="1.6" fill="currentColor"/>')],
    ["npc", "НПС", icon('<circle cx="12" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 19c1.2-3 3.2-4.5 6-4.5S16.8 16 18 19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>')],
    ["merchant", "Торговцы", icon('<path d="M4 9h16l-1.2 9H5.2zM8 9l1-4h6l1 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>')],
    ["enemy", "Враги", icon('<path d="M6 18l5-5M14 6l4 4-7 7H7v-4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>')],
    ["squads", "Отряды", icon('<circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 18c.8-2.2 2.2-3.2 4-3.2S11.2 15.8 12 18M12 18c.8-2.2 2.2-3.2 4-3.2S19.2 15.8 20 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>')],
    ["names", "Имена", icon('<path d="M5 18L9.5 6h2L16 18M6.6 14h7.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>')],
    ["goods", "Предметы", icon('<path d="M4 8h16v11H4zM4 8l2-3h12l2 3M12 5v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>')],
    ["wares", "Товары", icon('<path d="M5 8h14v11H5zM5 8l2.5-3h9L19 8M9 12h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>')],
    ["coins", "Валюта", icon('<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 8.5v7M9.5 10.2c.6-.8 1.4-1.2 2.5-1.2 1.4 0 2.3.7 2.3 1.7S13.4 12.4 12 12.4 9.7 13.1 9.7 14.2s1 1.8 2.4 1.8c1 0 1.8-.4 2.4-1.1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>')],
    ["monsters", "Монстры", icon('<path d="M6 14c0-4 2.2-8 6-8s6 4 6 8v5H6zM9 11h.01M15 11h.01M9 19v2M15 19v2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>')],
    ["spells", "Магия", icon('<path d="M12 3l1.6 5.2L19 10l-5.4 1.8L12 17l-1.6-5.2L5 10l5.4-1.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>')]
  ];
  const FIELDS = {
    places: [["name", "Название", "text"]],
    npc: PERSON,
    merchant: PERSON,
    enemy: PERSON,
    goods: [["name", "Название", "text"], ["price", "Цена", "text"], ["note", "Заметка", "text"]],
    monsters: [["name", "Имя", "text"], ["note", "Заметка", "text"], ["damage", "Урон", "text"], ["hp", "ХП", "number"]],
    spells: [["name", "Название", "text"], ["level", "Круг", "text"], ["note", "Заметка", "text"]]
  };
  const ROLES = { npc: "НПС", merchant: "Торговец", enemy: "Враг" };

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hint(key) {
    return {
      name: "Имя или название записи",
      note: "Заметка ведущего. Игрокам не уходит",
      weapon: "Чем вооружён",
      damage: "Урон атаки, например 1к6",
      hp: "Сколько хитов сейчас",
      hpMax: "Максимум хитов",
      price: "Цена в лавке",
      level: "Круг заклинания"
    }[key] || "";
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

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function invent(style) {
    if (style === "hard") {
      return pick(["Гр", "Др", "Бр", "Кр", "Тр", "Зг", "Хр"]) + pick(["а", "у", "о"]) + pick(["к", "г", "р", "з"]) + pick(["ак", "ур", "ог", "ан", ""]);
    }
    if (style === "short") {
      return pick(["Бар", "Тор", "Кел", "Ним", "Рок", "Вен", "Дар", "Сил", "Орн", "Лес"]) + pick(["", "д", "н", "к", "м"]);
    }
    return pick(["Ли", "Ми", "Эл", "Аэ", "Се", "Ва", "Те", "Ка", "Но", "Ил"]) + pick(["ла", "ри", "не", "са", "ви", "мо", "де", "на", "ра"]) + pick(["", "н", "я", "ль", "та", "ра"]);
  }

  let catalogPromise = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const found = document.querySelector('script[src="' + src + '"]');
      if (found) {
        if (found.dataset.ready === "1") resolve();
        else found.addEventListener("load", function () { resolve(); }, { once: true });
        return;
      }
      const node = document.createElement("script");
      node.src = src;
      node.onload = function () { node.dataset.ready = "1"; resolve(); };
      node.onerror = reject;
      document.head.appendChild(node);
    });
  }

  function loadCatalog() {
    if (window.allMonsters && window.allItems && window.allSpells) return Promise.resolve();
    if (!catalogPromise) {
      catalogPromise = Promise.all([
        loadScript("/catalog/monsters.js"),
        loadScript("/catalog/items.js"),
        loadScript("/catalog/spells.js")
      ]);
    }
    return catalogPromise;
  }

  function plain(value) {
    const text = Array.isArray(value) ? value.join(" ") : value;
    return String(text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  function blocks(value) {
    if (!value) return [];
    const list = Array.isArray(value) ? value : [value];
    return list.map(function (item) {
      if (typeof item === "string") return { name: "", text: item };
      return { name: item.name || "", text: plain(item.text) };
    });
  }

  function monsterImg(monster) {
    const match = String(monster.name || "").match(/\(([^)]+)\)\s*$/);
    if (!match) return "";
    const file = match[1].toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/ +/g, "_") + ".jpg";
    return "/catalog/img/monsters/" + encodeURIComponent(file);
  }

  function ruTitle(name) {
    return String(name || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  }

  function ensure(campaign) {
    if (!campaign.codex) campaign.codex = {};
    const book = campaign.codex;
    book.places = book.places || [];
    book.npcs = book.npcs || [];
    book.goods = book.goods || [];
    book.wares = book.wares || [];
    book.monsters = book.monsters || [];
    book.spells = book.spells || [];
    book.squads = book.squads || [];
    book.npcs.forEach(function (row) { if (!row.role) row.role = "npc"; });
    return book;
  }

  function adopt(campaign) {
    if (!campaign) return false;
    const book = ensure(campaign);
    let changed = false;
    function picture(value) {
      const text = String(value || "");
      return text && text.indexOf("..") < 0 ? text : "";
    }
    (campaign.pages || []).forEach(function (page) {
      (page.views || []).forEach(function (view) {
        (view.locations || []).forEach(function (loc) {
          if (!loc || loc.trashed) return;
          let place = loc.placeId && book.places.find(function (row) { return row.id === loc.placeId; });
          if (!place) {
            const id = loc.placeId || crypto.randomUUID();
            place = { id: id, name: loc.name || "Локация", people: [] };
            book.places.push(place);
            loc.placeId = id;
            changed = true;
          }
          if (!String(place.name || "").trim() && loc.name) {
            place.name = loc.name;
            changed = true;
          }
          const portrait = picture(loc.portrait || loc.day);
          const backdrop = picture(loc.night || loc.day);
          if (portrait && !place.portrait) {
            place.portrait = portrait;
            if (loc.portraitX != null) place.portraitX = loc.portraitX;
            if (loc.portraitY != null) place.portraitY = loc.portraitY;
            if (loc.portraitZoom != null) place.portraitZoom = loc.portraitZoom;
            changed = true;
          }
          if (backdrop && !place.backdrop) {
            place.backdrop = backdrop;
            changed = true;
          }
        });
        (view.markers || []).forEach(function (marker) {
          if (!marker || marker.kind !== "npc") return;
          let npc = marker.npcId && book.npcs.find(function (row) { return row.id === marker.npcId; });
          if (!npc) {
            const id = marker.npcId || crypto.randomUUID();
            npc = {
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
              portrait: picture(marker.portrait)
            };
            book.npcs.push(npc);
            marker.npcId = id;
            changed = true;
          } else if (picture(marker.portrait) && !npc.portrait) {
            npc.portrait = picture(marker.portrait);
            changed = true;
          }
        });
      });
    });
    const actors = campaign.battle && Array.isArray(campaign.battle.actors) ? campaign.battle.actors : [];
    const foeIds = [];
    actors.forEach(function (actor) {
      if (!actor || !String(actor.name || "").trim()) return;
      const role = actor.side === "player" ? "npc" : "enemy";
      let person = actor.codexId && book.npcs.find(function (row) { return row.id === actor.codexId; });
      if (!person) {
        person = {
          id: crypto.randomUUID(),
          role: role,
          name: actor.name,
          note: actor.note || (role === "npc" ? "Герой" : ""),
          weapon: actor.weapon || "",
          damage: actor.damage || "",
          hp: actor.hpMax || actor.hp || 0,
          hpMax: actor.hpMax || actor.hp || 0,
          portrait: picture(actor.portrait)
        };
        book.npcs.push(person);
        actor.codexId = person.id;
        changed = true;
      }
      if (role === "enemy") foeIds.push(person.id);
    });
    (campaign.pages || []).forEach(function (page) {
      (page.views || []).forEach(function (view) {
        (view.markers || []).forEach(function (marker) {
          if (!marker || marker.kind !== "foe") return;
          const actor = actors.find(function (row) { return row && (row.markerId === marker.id || row.id === marker.actorId); });
          if (actor && actor.codexId && marker.codexId !== actor.codexId) {
            marker.codexId = actor.codexId;
            changed = true;
            return;
          }
          if (marker.codexId && book.npcs.some(function (row) { return row.id === marker.codexId; })) return;
          if (actor) return;
          const person = {
            id: crypto.randomUUID(),
            role: "enemy",
            name: marker.name || "Враг",
            note: "",
            weapon: marker.weapon || "",
            damage: marker.damage || "",
            hp: marker.hpMax || marker.hp || 0,
            hpMax: marker.hpMax || marker.hp || 0,
            portrait: picture(marker.portrait)
          };
          book.npcs.push(person);
          marker.codexId = person.id;
          foeIds.push(person.id);
          changed = true;
        });
      });
    });
    const usedPlaces = {};
    (campaign.pages || []).forEach(function (page) {
      (page.views || []).forEach(function (view) {
        (view.locations || []).forEach(function (loc) {
          if (loc && loc.placeId && !loc.trashed) usedPlaces[loc.placeId] = true;
        });
      });
    });
    const before = book.places.length;
    book.places = book.places.filter(function (place) {
      if (!place) return false;
      if (usedPlaces[place.id]) return true;
      if (place.people && place.people.length) return true;
      if (place.portrait || place.backdrop) return true;
      if (String(place.name || "").trim() && place.name !== "Локация") return true;
      return false;
    });
    if (book.places.length !== before) changed = true;
    const board = campaign.battle && campaign.battle.board;
    if (Array.isArray(board) && board.some(function (group) { return group && group.kind !== "sep"; })) {
      board.forEach(function (group) {
        if (!group || group.kind === "sep") return;
        const members = [];
        (group.memberIds || []).forEach(function (id) {
          const actor = actors.find(function (row) { return row && row.id === id; });
          if (actor && actor.side !== "player" && actor.codexId) members.push(actor.codexId);
        });
        if (!members.length) return;
        let squad = group.codexSquadId && book.squads.find(function (row) { return row.id === group.codexSquadId; });
        if (!squad) {
          squad = { id: crypto.randomUUID(), name: group.name || "Отряд", placeId: "", memberIds: members.slice() };
          book.squads.push(squad);
          changed = true;
        } else {
          const prev = (squad.memberIds || []).slice().sort().join(",");
          const next = members.slice().sort().join(",");
          if (prev !== next) {
            squad.memberIds = members.slice();
            changed = true;
          }
        }
        if (group.codexSquadId !== squad.id) {
          group.codexSquadId = squad.id;
          changed = true;
        }
      });
    }
    return changed;
  }

  function mount(host, ctx) {
    if (host._codexOff) host._codexOff();
    let tab = "places";
    const wareOpen = {};
    let timer = 0;
    let dirty = false;
    let draftName = "";
    let nameStyle = "soft";
    let squadName = "";
    let squadCount = 3;
    let squadHp = 8;
    let squadDamage = "";
    let squadPlace = "";
    let query = "";
    let hits = [];
    let catalogError = false;
    let alive = true;

    function book() {
      return ensure(ctx.campaign);
    }
    function isPerson(kind) {
      return kind === "npc" || kind === "merchant" || kind === "enemy";
    }
    function list() {
      if (isPerson(tab)) return book().npcs.filter(function (row) { return row.role === tab; });
      if (tab === "squads") return book().squads;
      return book()[tab] || [];
    }
    function flush() {
      if (!dirty) return;
      clearTimeout(timer);
      timer = 0;
      dirty = false;
      ctx.save();
    }
    function saveSoon() {
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(flush, 250);
    }
    function eachView(fn) {
      (ctx.campaign.pages || []).forEach(function (page) {
        if (page.kind !== "map") return;
        (page.views || []).forEach(fn);
      });
    }
    function renamePins(kind, id, name) {
      eachView(function (view) {
        const rows = kind === "places" ? view.locations : view.markers;
        (rows || []).forEach(function (row) {
          const ref = kind === "places" ? row.placeId : row.npcId;
          if (ref === id) row.name = name;
        });
      });
    }
    function unlink(kind, id) {
      eachView(function (view) {
        const rows = kind === "places" ? view.locations : view.markers;
        (rows || []).forEach(function (row) {
          if (kind === "places" && row.placeId === id) row.placeId = "";
          if (kind === "npcs" && row.npcId === id) row.npcId = "";
        });
      });
    }
    function blank() {
      const row = { id: crypto.randomUUID() };
      const names = { places: "Место", npc: "НПС", merchant: "Торговец", enemy: "Враг", goods: "Предмет", monsters: "Монстр", spells: "Заклинание" };
      (FIELDS[tab] || []).forEach(function (field) {
        row[field[0]] = field[2] === "number" ? 0 : "";
      });
      row.name = names[tab] || "Запись";
      if (isPerson(tab)) row.role = tab;
      return row;
    }
    function catalogKind() {
      return tab === "goods" || tab === "monsters" || tab === "spells";
    }
    function findHits(q) {
      if (tab === "monsters") {
        return (window.allMonsters || []).filter(function (row) {
          return String(row.name || "").toLowerCase().indexOf(q) >= 0;
        });
      }
      const rows = tab === "goods" ? (window.allItems || []) : (window.allSpells || []);
      return rows.filter(function (row) {
        const ru = row.ru && row.ru.name || "";
        const en = row.en && row.en.name || "";
        return (ru + " " + en).toLowerCase().indexOf(q) >= 0;
      });
    }
    function hitTitle(row) {
      if (tab === "monsters") return row.name || "";
      return (row.ru && row.ru.name) || (row.en && row.en.name) || "";
    }
    function hitMeta(row) {
      if (tab === "monsters") return [row.type, row.cr ? "ОП " + row.cr : ""].filter(Boolean).join(" · ");
      if (tab === "goods") {
        const rarity = window.oRarity && window.oRarity[String(row.en && row.en.rarity)];
        return (rarity && rarity.text && rarity.text.ru && rarity.text.ru.title) || "";
      }
      const level = row.ru && row.ru.level;
      return [level === "0" ? "заговор" : (level ? level + " круг" : ""), row.ru && row.ru.school].filter(Boolean).join(" · ");
    }
    function previewHtml(row) {
      if (tab === "monsters") {
        const size = window.monsterSize && window.monsterSize[row.size];
        const img = monsterImg(row);
        const bits = blocks(row.trait).concat(blocks(row.action)).slice(0, 6);
        return (img ? '<img alt="" src="' + esc(img) + '" onerror="this.remove()">' : "") +
          "<h3>" + esc(row.name || "") + "</h3><p>" + esc([size, row.type, row.cr ? "ОП " + row.cr : "", row.ac ? "КД " + row.ac : "", row.hp ? "ХП " + row.hp : ""].filter(Boolean).join(" · ")) + "</p>" +
          bits.map(function (bit) { return "<p><b>" + esc(bit.name) + "</b> " + esc(bit.text) + "</p>"; }).join("");
      }
      if (tab === "goods") {
        const img = row.en && row.en.img ? "/catalog/img/items/" + encodeURIComponent(row.en.img) : "";
        return (img ? '<img alt="" src="' + esc(img) + '" onerror="this.remove()">' : "") +
          "<h3>" + esc(hitTitle(row)) + "</h3><p>" + esc(hitMeta(row)) + "</p><p>" + esc(plain(row.ru && row.ru.text)) + "</p>";
      }
      const ru = row.ru || {};
      return "<h3>" + esc(ru.name || "") + "</h3><p>" + esc(hitMeta(row)) + "</p><p>" + esc([ru.castingTime, ru.range, ru.duration, ru.components].filter(Boolean).join(" · ")) + "</p><p>" + esc(plain(ru.text)) + "</p>";
    }
    function takeHit(row) {
      if (tab === "monsters") {
        const hp = Number((String(row.hp || "").match(/\d+/) || [])[0]) || 0;
        book().npcs.push({
          id: crypto.randomUUID(),
          role: "enemy",
          name: ruTitle(row.name) || "Враг",
          note: [row.type, row.cr ? "ОП " + row.cr : ""].filter(Boolean).join(", "),
          weapon: "",
          damage: "",
          hp: hp,
          hpMax: hp,
          portrait: monsterImg(row)
        });
        return;
      }
      if (tab === "goods") {
        const rarity = window.oRarity && window.oRarity[String(row.en && row.en.rarity)];
        book().goods.push({
          id: crypto.randomUUID(),
          name: hitTitle(row) || "Предмет",
          price: (rarity && rarity.coast) || "",
          note: plain(row.ru && row.ru.text),
          image: row.en && row.en.img ? "/catalog/img/items/" + encodeURIComponent(row.en.img) : ""
        });
        return;
      }
      const ru = row.ru || {};
      book().spells.push({
        id: crypto.randomUUID(),
        name: ru.name || "Заклинание",
        level: ru.level === "0" ? "заговор" : (ru.level || ""),
        note: plain(ru.text)
      });
    }
    function paintResults() {
      const box = host.querySelector("#cat-results");
      if (!box) return;
      const q = query.trim().toLowerCase();
      if (q.length < 2) {
        hits = [];
        box.innerHTML = '<p class="note">Введите хотя бы две буквы.</p>';
        return;
      }
      hits = findHits(q).slice(0, 24);
      box.innerHTML = hits.length ? hits.map(function (row, index) {
        const label = tab === "monsters" ? "Во враги" : (tab === "goods" ? "В предметы" : "В магию");
        const give = tab === "goods"
          ? '<select data-give="' + index + '" title="Кому отдать предмет как товар" aria-label="НПС">' + npcOptions("НПС") + '</select><button type="button" data-act="give" data-i="' + index + '" title="Добавить предмет в товары этого НПС">К НПС</button>'
          : "";
        return '<div class="cat-hit" data-i="' + index + '"><b>' + esc(hitTitle(row)) + '</b><span>' + esc(hitMeta(row)) + "</span>" + give + '<button type="button" data-act="take" data-i="' + index + '" title="Скопировать в справочник комнаты">' + label + "</button></div>";
      }).join("") : '<p class="note">Ничего не найдено.</p>';
    }
    function placeIndex(id) {
      return book().places.findIndex(function (row) { return row.id === id; });
    }
    function placeSubtree(id) {
      const ids = {};
      function walk(placeId) {
        ids[placeId] = true;
        book().places.forEach(function (place) {
          if (place && (place.parentId || "") === placeId) walk(place.id);
        });
      }
      walk(id);
      return ids;
    }
    function seatOf(npcId) {
      return book().places.find(function (place) {
        return place && (place.people || []).indexOf(npcId) >= 0;
      }) || null;
    }
    function closeHomeMenu() {
      const menu = document.getElementById("pin-menu");
      if (menu) menu.remove();
    }
    function eachMapLoc(visit) {
      (ctx.campaign.pages || []).forEach(function (page) {
        (page.views || []).forEach(function (view) {
          (view.locations || []).forEach(function (loc) {
            if (loc && !loc.trashed) visit(loc, view);
          });
        });
      });
    }
    function eachMapView(visit) {
      (ctx.campaign.pages || []).forEach(function (page) {
        (page.views || []).forEach(function (view) {
          if (view) visit(view, page);
        });
      });
    }
    function locIdForPlace(placeId) {
      if (!placeId) return "";
      let found = "";
      eachMapLoc(function (loc) {
        if (!found && loc.placeId === placeId) found = loc.id;
      });
      return found;
    }
    function syncPlaceParent(placeId, parentPlaceId) {
      const parentLoc = locIdForPlace(parentPlaceId);
      const blocked = {};
      eachMapLoc(function (loc) {
        if (loc.placeId === placeId) blocked[loc.id] = true;
      });
      eachMapLoc(function (loc) {
        if (loc.placeId !== placeId) return;
        if (parentLoc && blocked[parentLoc]) return;
        loc.parentId = parentLoc || "";
      });
    }
    function markerPersonIds(marker) {
      const ids = {};
      if (!marker) return ids;
      if (marker.npcId) ids[marker.npcId] = true;
      if (marker.codexId) ids[marker.codexId] = true;
      if (marker.actorId && ctx.campaign.battle && Array.isArray(ctx.campaign.battle.actors)) {
        const actor = ctx.campaign.battle.actors.find(function (row) { return row && row.id === marker.actorId; });
        if (actor && actor.codexId) ids[actor.codexId] = true;
      }
      return ids;
    }
    function syncNpcSeat(personId, placeId) {
      if (!personId) return;
      const locId = locIdForPlace(placeId);
      eachMapView(function (view) {
        const hits = (view.markers || []).filter(function (marker) {
          return !!markerPersonIds(marker)[personId];
        });
        if (!hits.length) return;
        hits.sort(function (a, b) {
          const rank = function (marker) {
            return marker.kind === "npc" ? 0 : (marker.kind === "foe" ? 1 : 2);
          };
          return rank(a) - rank(b);
        });
        const keep = hits[0];
        keep.locId = locId || "";
        if (keep.kind === "npc" && !keep.npcId) keep.npcId = personId;
        if (keep.kind === "foe" && !keep.codexId) keep.codexId = personId;
        if (hits.length === 1) return;
        const drop = {};
        hits.slice(1).forEach(function (marker) { drop[marker.id] = true; });
        view.markers = view.markers.filter(function (marker) { return !drop[marker.id]; });
        const actors = ctx.campaign.battle && ctx.campaign.battle.actors || [];
        actors.forEach(function (actor) {
          if (actor && drop[actor.markerId]) actor.markerId = keep.id;
        });
      });
    }
    function seatPerson(personId, placeId) {
      if (!personId) return;
      book().places.forEach(function (place) {
        if (!place || !place.people) return;
        place.people = place.people.filter(function (id) { return id !== personId; });
      });
      if (!placeId) return;
      const place = book().places.find(function (row) { return row.id === placeId; });
      if (!place) return;
      place.people = place.people || [];
      if (place.people.indexOf(personId) < 0) place.people.push(personId);
    }
    function moveSquadToPlace(squad, placeId) {
      if (!squad) return;
      const to = placeId || "";
      const members = (squad.memberIds || []).filter(Boolean);
      squad.placeId = to;
      squad.memberIds = members;
      members.forEach(function (id) {
        seatPerson(id, to);
        syncNpcSeat(id, to);
      });
    }
    function moveNpcToPlace(npcId, placeId) {
      if (!npcId) return;
      seatPerson(npcId, placeId || "");
      syncNpcSeat(npcId, placeId || "");
    }
    function movePlaceTo(placeId, parentId) {
      const place = book().places.find(function (row) { return row.id === placeId; });
      if (!place) return;
      const to = parentId || "";
      if (to && placeSubtree(placeId)[to]) return;
      if ((place.parentId || "") === to) return;
      place.parentId = to;
      syncPlaceParent(placeId, to);
    }
    function placePickHtml(blocked) {
      const places = book().places;
      const known = {};
      places.forEach(function (place) { if (place) known[place.id] = true; });
      function lines(parentId, depth) {
        return places.filter(function (place) {
          const parent = place.parentId || "";
          if (parentId) return parent === parentId;
          return !parent || !known[parent];
        }).map(function (place) {
          const off = blocked[place.id];
          return '<button type="button" data-to="' + esc(place.id) + '"' + (off ? " disabled" : "") +
            ' style="padding-left:' + (8 + depth * 12) + 'px" title="' + (off ? "Сюда нельзя" : "Перенести сюда") + '">' +
            esc(place.name || "Место") + "</button>" + lines(place.id, depth + 1);
        }).join("");
      }
      return '<button type="button" data-to="" title="Без родителя">Корень</button>' + lines("", 0);
    }
    function pickPlaceHome(kind, id, anchor) {
      closeHomeMenu();
      const blocked = kind === "place" ? placeSubtree(id) : {};
      const menu = document.createElement("div");
      menu.id = "pin-menu";
      menu.className = "pin-menu pin-home";
      const title = kind === "place" ? "Перенести место в" : "Перенести на место";
      const none = kind === "place"
        ? ""
        : '<button type="button" data-to="" title="Убрать со всех мест">Нигде</button>';
      menu.innerHTML = '<p class="note">' + title + "</p>" + (kind === "place" ? placePickHtml(blocked) : none + book().places.map(function (place) {
        return '<button type="button" data-to="' + esc(place.id) + '" title="Поставить сюда">' + esc(place.name || "Место") + "</button>";
      }).join("") || '<p class="roll-empty">Мест нет</p>');
      const rect = (anchor || host).getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 240)) + "px";
      menu.style.top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 320)) + "px";
      document.body.appendChild(menu);
      menu.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
      menu.addEventListener("click", function (event) {
        const button = event.target.closest("[data-to]");
        if (!button || button.disabled) return;
        const to = button.getAttribute("data-to") || "";
        if (kind === "place") movePlaceTo(id, to);
        else moveNpcToPlace(id, to);
        closeHomeMenu();
        paint();
        saveSoon();
      });
    }
    function placeCardHtml(place, index, depth) {
      const npcs = book().npcs;
      const people = (place.people || []).map(function (id) {
        const npc = npcs.find(function (row) { return row.id === id; });
        if (!npc) return "";
        return '<span class="place-person" data-npc="' + esc(id) + '" title="ПКМ — перенести персонажа">' + esc(npc.name || "Без имени") + '<button type="button" data-act="unseat" data-i="' + index + '" data-npc="' + esc(id) + '" title="Убрать персонажа с места" aria-label="Убрать">×</button></span>';
      }).join("");
      const options = npcs.map(function (npc) {
        return '<option value="' + esc(npc.id) + '">' + esc((npc.name || "Без имени") + " · " + (ROLES[npc.role] || "НПС")) + "</option>";
      }).join("");
      const bound = (book().squads || []).filter(function (squad) { return squad.placeId === place.id; });
      const squadLine = bound.length ? '<p class="note">Отряд: ' + bound.map(function (squad) { return esc(squad.name || "Отряд"); }).join(", ") + "</p>" : "";
      const parent = place.parentId && book().places.find(function (row) { return row.id === place.parentId; });
      const parentLine = parent ? '<p class="note">Внутри: ' + esc(parent.name || "Место") + "</p>" : "";
      const scene = place.backdrop ? ' style="background-image:url(&quot;' + esc(place.backdrop) + '&quot;)"' : "";
      const face = place.portrait
        ? '<button type="button" class="npc-portrait" data-act="face" data-i="' + index + '" title="Настроить, какая часть изображения видна"><img alt="" src="' + esc(place.portrait) + '" style="' + faceStyle(place) + '"></button>'
        : '<span class="npc-portrait npc-portrait-empty" aria-hidden="true"></span>';
      return '<article class="place-card" data-place="' + esc(place.id) + '" style="margin-left:' + (depth * 16) + 'px" title="ПКМ — перенести место">' +
        '<div class="npc-scene"' + scene + ">" + face +
        '<div class="npc-pics">' +
        '<label class="file-btn" title="Загрузить изображение места, как портрет у НПС">' + FACE + '<input type="file" accept="image/*" data-pic="portrait" data-i="' + index + '" aria-label="Изображение места"></label>' +
        '<label class="file-btn" title="Загрузить фон карточки места">' + SCENE + '<input type="file" accept="image/*" data-pic="backdrop" data-i="' + index + '" aria-label="Фон места"></label>' +
        (place.portrait ? '<button type="button" data-act="clear-pic" data-pic="portrait" data-i="' + index + '" title="Убрать изображение" aria-label="Убрать изображение">×</button>' : "") +
        (place.backdrop ? '<button type="button" data-act="clear-pic" data-pic="backdrop" data-i="' + index + '" title="Убрать фон" aria-label="Убрать фон">×</button>' : "") +
        "</div></div>" +
        '<div class="codex-row"><input data-field="name" data-i="' + index + '" type="text" value="' + esc(place.name || "") + '" title="Название места" aria-label="Название места"><button type="button" data-act="rehome" data-kind="place" data-id="' + esc(place.id) + '" title="Перенести в другое место">Перенести</button><button type="button" data-act="del" data-i="' + index + '" title="Удалить место" aria-label="Удалить">×</button></div>' +
        parentLine + squadLine +
        '<div class="place-people">' + (people || '<span class="note">На месте никого нет.</span>') + "</div>" +
        (npcs.length
          ? '<div class="codex-row"><select data-seat="' + index + '" title="Кого поставить на это место" aria-label="Персонаж"><option value="">Персонаж</option>' + options + '</select><button type="button" data-act="seat" data-i="' + index + '" title="Поставить выбранного персонажа">На место</button></div>'
          : '<p class="note">Сначала заведите персонажей.</p>') +
        "</article>";
    }
    function placesHtml() {
      const places = book().places;
      if (!places.length) return '<p class="note">Пока пусто. На место ставятся уже созданные персонажи. ПКМ по карточке — перенос.</p>';
      const known = {};
      places.forEach(function (place) { if (place) known[place.id] = true; });
      const seen = {};
      function walk(parentId, depth) {
        return places.filter(function (place) {
          const parent = place.parentId || "";
          if (parentId) return parent === parentId;
          return !parent || !known[parent];
        }).map(function (place) {
          if (seen[place.id]) return "";
          seen[place.id] = true;
          const index = placeIndex(place.id);
          return placeCardHtml(place, index, depth) + walk(place.id, depth + 1);
        }).join("");
      }
      return walk("", 0);
    }
    function takenHtml() {
      const rows = list();
      if (!rows.length || tab === "monsters") return "";
      return '<div class="codex-taken"><b>Взятые</b>' + rows.map(function (row, index) {
        return '<div class="cat-hit"><b>' + esc(row.name || "Без имени") + '</b><button type="button" data-act="del" data-i="' + index + '" title="Убрать из комнаты" aria-label="Удалить">×</button></div>';
      }).join("") + "</div>";
    }
    function squadsHtml() {
      const squads = book().squads;
      if (!squads.length) return '<p class="note">Отряда пока нет. Соберите его здесь и привяжите к месту.</p>';
      return squads.map(function (squad, index) {
        const options = '<option value="">Без места</option>' + book().places.map(function (place) {
          return '<option value="' + esc(place.id) + '"' + (place.id === squad.placeId ? " selected" : "") + ">" + esc(place.name || "Место") + "</option>";
        }).join("");
        const members = (squad.memberIds || []).map(function (id) {
          const npc = book().npcs.find(function (row) { return row.id === id; });
          return npc ? "<li>" + esc(npc.name || "Враг") + "</li>" : "";
        }).filter(Boolean).join("");
        return '<article class="place-card"><div class="codex-row"><input data-field="name" data-i="' + index + '" type="text" value="' + esc(squad.name || "") + '" title="Название отряда" aria-label="Название отряда"><button type="button" data-act="del" data-i="' + index + '" title="Удалить отряд" aria-label="Удалить">×</button></div>' +
          '<label title="Локация, к которой привязан отряд">Место<select data-squad-place="' + index + '" aria-label="Место отряда">' + options + "</select></label>" +
          (members ? '<ol class="squad-members">' + members + "</ol>" : '<p class="note">В отряде никого нет.</p>') + "</article>";
      }).join("");
    }
    function parseCsv(text) {
      const raw = String(text || "").replace(/^\uFEFF/, "");
      const lines = raw.split(/\r?\n/).filter(function (line) { return line.trim(); });
      if (!lines.length) return [];
      const semi = (lines[0].match(/;/g) || []).length;
      const comma = (lines[0].match(/,/g) || []).length;
      const sep = semi > comma ? ";" : ",";
      function cells(line) {
        const out = [];
        let cur = "";
        let quote = false;
        for (let i = 0; i < line.length; i += 1) {
          const ch = line[i];
          if (quote) {
            if (ch === '"') {
              if (line[i + 1] === '"') { cur += '"'; i += 1; }
              else quote = false;
            } else cur += ch;
          } else if (ch === '"') quote = true;
          else if (ch === sep) { out.push(cur.trim()); cur = ""; }
          else cur += ch;
        }
        out.push(cur.trim());
        return out;
      }
      let rows = lines.map(cells);
      const head = String(rows[0][0] || "").toLowerCase();
      if (head === "название" || head === "name" || head === "товар") rows = rows.slice(1);
      return rows.filter(function (row) { return row[0]; }).map(function (row) {
        return { id: crypto.randomUUID(), name: row[0], price: row[1] || "", note: row[2] || "", icon: row[3] || "" };
      });
    }
    function keepImage(npc, url, name) {
      if (!window.ShirmoLib || !url) return;
      if (!ctx.campaign.library) ctx.campaign.library = { fonts: [], images: [], notes: [] };
      window.ShirmoLib.keep(ctx.campaign.library, {
        url: url,
        name: name || (npc && npc.name) || "Картинка",
        section: npc && npc.id ? "npc:" + npc.id : "",
        sectionName: (npc && npc.name) || "НПС"
      });
    }
    function npcOptions(placeholder) {
      return '<option value="">' + esc(placeholder) + "</option>" + book().npcs.map(function (npc) {
        return '<option value="' + esc(npc.id) + '">' + esc((npc.name || "Без имени") + " · " + (ROLES[npc.role] || "НПС")) + "</option>";
      }).join("");
    }
    function tradeHtml(row, index) {
      const options = (book().wares || []).map(function (sheet) {
        return '<option value="' + esc(sheet.id) + '"' + (sheet.id === row.wareId ? " selected" : "") + ">" + esc(sheet.name || "Лист") + "</option>";
      }).join("");
      const own = (row.goods || []).map(function (item, itemIndex) {
        const icon = item.icon ? '<img class="cat-thumb" alt="" src="' + esc(item.icon) + '">' : "";
        const qty = item.qty == null || item.qty === "" ? "" : esc(String(item.qty));
        const sheets = (book().wares || []).filter(function (sheet) { return sheet && (sheet.npcId === row.id || sheet.id === row.wareId); });
        const sheetPick = '<select data-good-sheet data-i="' + index + '" data-item="' + itemIndex + '" title="Положить товар в лист этого персонажа" aria-label="Лист товаров"><option value="">Свои</option>' +
          sheets.map(function (sheet) { return '<option value="' + esc(sheet.id) + '">' + esc(sheet.name || "Лист") + "</option>"; }).join("") +
          '<option value="__new">Новый лист</option></select>';
        const off = !!item.off;
        return '<span class="place-person' + (off ? " is-off" : "") + '">' + icon +
          '<input data-good-name data-i="' + index + '" data-item="' + itemIndex + '" type="text" value="' + esc(item.name || "") + '" aria-label="Название товара">' +
          '<input data-good-note data-i="' + index + '" data-item="' + itemIndex + '" type="text" value="' + esc(item.note || "") + '" placeholder="Заметка" title="Заметка, игрокам не уходит" aria-label="Заметка">' +
          '<button type="button" class="icon-btn" data-good-edit data-i="' + index + '" data-item="' + itemIndex + '" title="Иконка и цвет" aria-label="Иконка и цвет">' + (window.ShirmoGlyph ? window.ShirmoGlyph.pencil : "✎") + "</button>" +
          '<button type="button" class="icon-btn eye' + (off ? " is-off" : "") + '" data-good-eye data-i="' + index + '" data-item="' + itemIndex + '" title="' + (off ? "Показать товар игрокам" : "Скрыть товар от игроков") + '" aria-label="' + (off ? "Показать товар игрокам" : "Скрыть товар от игроков") + '">' + (window.ShirmoGlyph ? (off ? window.ShirmoGlyph.hide : window.ShirmoGlyph.eye) : "●") + "</button>" +
          sheetPick +
          '<input data-good-qty data-i="' + index + '" data-item="' + itemIndex + '" class="num" type="number" min="0" value="' + qty + '" title="Количество. Пустое поле — без ограничения" aria-label="Количество">' +
          '<label class="check icon-btn" title="Скрывать у игроков, когда количество станет нулём">' + (window.ShirmoGlyph ? window.ShirmoGlyph.hide : "") + '<input data-good-hide data-i="' + index + '" data-item="' + itemIndex + '" type="checkbox"' + (item.hideEmpty ? " checked" : "") + ' aria-label="Скрывать при нуле"></label>' +
          '<button type="button" data-act="drop-good" data-i="' + index + '" data-item="' + itemIndex + '" title="Убрать товар у персонажа" aria-label="Убрать">×</button></span>';
      }).join("");
      return '<label title="Лист товаров, который продаёт этот персонаж">Лист товаров<select data-npc-ware data-i="' + index + '" aria-label="Лист товаров"><option value="">Без листа</option>' + options + "</select></label>" +
        (own ? '<div class="place-people">' + own + "</div>" : "");
    }
    function wareItemHtml(sheetIndex, item, itemIndex) {
      const images = (ctx.campaign.library && ctx.campaign.library.images) || [];
      const lib = images.map(function (image) {
        const section = window.ShirmoLib ? window.ShirmoLib.title(image, book().npcs) : "";
        const label = section && section !== "Общее" ? section + " — " + (image.name || "Картинка") : (image.name || "Картинка");
        return '<option value="' + esc(image.url) + '">' + esc(label) + "</option>";
      }).join("");
      const catalog = (book().goods || []).filter(function (row) { return row && row.image; }).map(function (row) {
        return '<option value="' + esc(row.image) + '">' + esc(row.name || "Предмет") + "</option>";
      }).join("");
      const face = item.icon ? '<img alt="" src="' + esc(item.icon) + '">' : (window.ShirmoGlyph ? window.ShirmoGlyph.bag : "");
      const mark = ' data-stock="' + sheetIndex + '" data-item="' + itemIndex + '"';
      const key = sheetIndex + ":" + itemIndex;
      const open = !!wareOpen[key];
      const eye = window.ShirmoGlyph ? (item.off ? window.ShirmoGlyph.hide : window.ShirmoGlyph.eye) : (item.off ? "○" : "●");
      const pencil = window.ShirmoGlyph ? window.ShirmoGlyph.pencil : "✎";
      const fold = window.ShirmoGlyph ? window.ShirmoGlyph.fold : "▾";
      return '<article class="ware-item' + (item.off ? " is-off" : "") + '"' + (item.ink ? ' style="color:' + esc(item.ink) + '"' : "") + mark + ">" +
        '<div class="ware-head"><span class="ware-face">' + face + "</span>" +
        '<span class="ware-title"><input data-ware="name"' + mark + ' type="text" value="' + esc(item.name || "") + '" placeholder="Название" title="Название товара" aria-label="Название товара">' +
        '<input data-ware="note"' + mark + ' class="ware-note" type="text" value="' + esc(item.note || "") + '" placeholder="Заметка" title="Заметка, игрокам не уходит" aria-label="Заметка"></span>' +
        '<div class="ware-acts">' +
        '<button type="button" class="icon-btn" data-ware-edit' + mark + ' title="Иконка и цвет" aria-label="Иконка и цвет">' + pencil + "</button>" +
        '<button type="button" class="icon-btn ware-fold' + (open ? " is-open" : "") + '" data-ware-fold="' + esc(key) + '" title="Параметры товара" aria-label="Параметры товара" aria-expanded="' + (open ? "true" : "false") + '">' + fold + "</button>" +
        '<button type="button" class="icon-btn eye' + (item.off ? " is-off" : "") + '" data-ware-eye' + mark + ' title="' + (item.off ? "Показать товар игрокам" : "Скрыть товар от игроков") + '" aria-label="' + (item.off ? "Показать товар игрокам" : "Скрыть товар от игроков") + '">' + eye + "</button>" +
        '<button type="button" data-act="ware-del"' + mark + ' title="Убрать товар" aria-label="Убрать">×</button></div></div>' +
        '<div class="ware-more"' + (open ? "" : " hidden") + ">" +
        (window.ShirmoCoins ? window.ShirmoCoins.fields(item, ctx.campaign, 'data-ware="price"' + mark, 'data-ware="coin"' + mark) : "") +
        '<label title="Количество. Пустое поле — без ограничения">Количество<input data-ware="qty"' + mark + ' class="num" type="number" min="0" value="' + (item.qty == null || item.qty === "" ? "" : esc(String(item.qty))) + '" placeholder="∞" aria-label="Количество"></label>' +
        '<label class="check" title="Скрывать у игроков, когда количество станет нулём"><input data-ware-hide' + mark + ' type="checkbox"' + (item.hideEmpty ? " checked" : "") + "> Скрывать при нуле</label>" +
        '<select data-ware-lib' + mark + ' title="Иконка из библиотеки" aria-label="Иконка из библиотеки" hidden><option value="">Библиотека</option>' + lib + "</select>" +
        '<select data-ware-cat' + mark + ' hidden><option value="">Из предмета</option>' + catalog + "</select>" +
        "</div></article>";
    }
    function waresHtml() {
      const sheets = book().wares || [];
      const head = '<div class="codex-row"><button type="button" data-act="ware-sheet" title="Новый лист товаров">Новый лист</button>' +
        '<label class="file-btn" title="CSV: название, цена, заметка. Разделитель — запятая или точка с запятой">Импорт CSV<input type="file" accept=".csv,text/csv" data-ware-csv aria-label="Импорт CSV"></label></div>' +
        '<p class="note">Лист можно отдать персонажу. Товары из меню НПС появляются здесь: в листе или в блоке «Свои товары». Поиск предмета ставит иконку. Цвет задаётся строке.</p>';
      if (!sheets.length && !ownGoodsHtml()) return head + '<p class="note">Листа пока нет.</p>';
      return head + sheets.map(function (sheet, index) {
        const owners = book().npcs.filter(function (npc) { return npc.wareId === sheet.id; }).map(function (npc) { return npc.name || "Без имени"; });
        const items = (sheet.items || []).map(function (item, itemIndex) { return wareItemHtml(index, item, itemIndex); }).join("");
        return '<article class="place-card"><div class="codex-row"><input data-field="name" data-i="' + index + '" type="text" value="' + esc(sheet.name || "") + '" title="Название листа" aria-label="Название листа"><button type="button" class="icon-btn" data-act="show-sheet" data-i="' + index + '" title="Показать этот лист игрокам" aria-label="Показать игрокам">' + (window.ShirmoGlyph ? window.ShirmoGlyph.cast : "↗") + '</button><button type="button" data-act="del" data-i="' + index + '" title="Удалить лист" aria-label="Удалить">×</button></div>' +
          '<div class="codex-row"><select data-ware-owner data-i="' + index + '" title="Отдать этот лист персонажу" aria-label="Кому отдать лист">' + npcOptions("Отдать НПС") + "</select></div>" +
          (owners.length ? '<p class="note">Лист у: ' + esc(owners.join(", ")) + "</p>" : "") +
          items +
          '<button type="button" data-act="ware-add" data-i="' + index + '" title="Добавить строку в этот лист">Добавить товар</button></article>';
      }).join("") + ownGoodsHtml();
    }
    function ownGoodsHtml() {
      return book().npcs.map(function (npc, npcIndex) {
        const goods = (npc.goods || []).map(function (item, itemIndex) {
          if (!item || !String(item.name || "").trim()) return "";
          const mark = ' data-own="' + npcIndex + '" data-item="' + itemIndex + '"';
          const sheets = (book().wares || []).filter(function (sheet) { return sheet && (sheet.npcId === npc.id || sheet.id === npc.wareId); });
          const face = item.icon ? '<img alt="" src="' + esc(item.icon) + '">' : (window.ShirmoGlyph ? window.ShirmoGlyph.bag : "");
          const key = "own:" + npcIndex + ":" + itemIndex;
          const open = !!wareOpen[key];
          const eye = window.ShirmoGlyph ? (item.off ? window.ShirmoGlyph.hide : window.ShirmoGlyph.eye) : (item.off ? "○" : "●");
          return '<article class="ware-item' + (item.off ? " is-off" : "") + '"' + (item.ink ? ' style="color:' + esc(item.ink) + '"' : "") + mark + ">" +
            '<div class="ware-head"><span class="ware-face">' + face + "</span>" +
            '<span class="ware-title"><input data-own-field="name"' + mark + ' type="text" value="' + esc(item.name || "") + '" aria-label="Название товара">' +
            '<input data-own-field="note"' + mark + ' class="ware-note" type="text" value="' + esc(item.note || "") + '" placeholder="Заметка" title="Заметка, игрокам не уходит" aria-label="Заметка"></span>' +
            '<div class="ware-acts">' +
            '<button type="button" class="icon-btn" data-ware-edit' + mark + ' title="Иконка и цвет" aria-label="Иконка и цвет">' + (window.ShirmoGlyph ? window.ShirmoGlyph.pencil : "✎") + "</button>" +
            '<button type="button" class="icon-btn ware-fold' + (open ? " is-open" : "") + '" data-ware-fold="' + esc(key) + '" title="Параметры товара" aria-label="Параметры товара" aria-expanded="' + (open ? "true" : "false") + '">' + (window.ShirmoGlyph ? window.ShirmoGlyph.fold : "▾") + "</button>" +
            '<button type="button" class="icon-btn eye' + (item.off ? " is-off" : "") + '" data-own-eye' + mark + ' title="' + (item.off ? "Показать товар игрокам" : "Скрыть товар от игроков") + '" aria-label="' + (item.off ? "Показать товар игрокам" : "Скрыть товар от игроков") + '">' + eye + "</button>" +
            '<button type="button" data-act="drop-own"' + mark + ' title="Убрать товар" aria-label="Убрать">×</button></div></div>' +
            '<div class="ware-more"' + (open ? "" : " hidden") + ">" +
            (window.ShirmoCoins ? window.ShirmoCoins.fields(item, ctx.campaign, 'data-own-field="price"' + mark, 'data-own-field="coin"' + mark) : "") +
            '<label title="Количество. Пустое поле — без ограничения">Количество<input data-own-field="qty"' + mark + ' class="num" type="number" min="0" value="' + (item.qty == null || item.qty === "" ? "" : esc(String(item.qty))) + '" placeholder="∞" aria-label="Количество"></label>' +
            '<label class="check" title="Скрывать у игроков, когда количество станет нулём"><input data-own-hide' + mark + ' type="checkbox"' + (item.hideEmpty ? " checked" : "") + "> Скрывать при нуле</label>" +
            '<label title="Положить в лист этого персонажа">Лист<select data-own-sheet' + mark + ' aria-label="Лист товаров"><option value="">Свои</option>' +
            sheets.map(function (sheet) { return '<option value="' + esc(sheet.id) + '">' + esc(sheet.name || "Лист") + "</option>"; }).join("") +
            '<option value="__new">Новый лист</option></select></label></div></article>';
        }).join("");
        if (!goods) return "";
        return '<article class="place-card"><div class="codex-row"><p class="note">Свои товары: ' + esc(npc.name || "НПС") + '</p><button type="button" class="icon-btn" data-act="show-own" data-i="' + npcIndex + '" title="Показать эти товары игрокам" aria-label="Показать игрокам">' + (window.ShirmoGlyph ? window.ShirmoGlyph.cast : "↗") + "</button></div>" + goods + "</article>";
      }).join("");
    }
    function peopleHtml() {
      const rows = list();
      if (!rows.length) return '<p class="note">Пока пусто.</p>';
      const images = (ctx.campaign.library && ctx.campaign.library.images) || [];
      return rows.map(function (row, index) {
        if (window.ShirmoNpc) window.ShirmoNpc.apply(row);
        const scene = row.backdrop ? ' style="background-image:url(&quot;' + esc(row.backdrop) + '&quot;)"' : "";
        const face = row.portrait
          ? '<button type="button" class="npc-portrait" data-act="face" data-i="' + index + '" title="Настроить, какая часть портрета видна"><img alt="" src="' + esc(row.portrait) + '" style="' + faceStyle(row) + '"></button>'
          : '<span class="npc-portrait npc-portrait-empty" data-i="' + index + '" aria-hidden="true"></span>';
        const badge = row.emoji ? '<span class="npc-emoji">' + esc(row.emoji) + "</span>" : "";
        const rest = FIELDS[tab].filter(function (field) { return field[0] !== "name"; }).map(function (field) {
          const kind = field[2] === "number" ? ' type="number" min="0" class="num"' : ' type="text"';
          return '<label title="' + esc(hint(field[0]) || field[1]) + '">' + esc(field[1]) + '<input data-field="' + field[0] + '" data-i="' + index + '"' + kind + ' value="' + esc(row[field[0]] == null ? "" : row[field[0]]) + '" aria-label="' + esc(field[1]) + '"></label>';
        }).join("");
        const home = seatOf(row.id);
        const homeLine = '<p class="note">' + (home ? "Место: " + esc(home.name || "Место") : "Без места") + "</p>";
        return '<article class="npc-card" data-npc="' + esc(row.id) + '" title="ПКМ — перенести на место"><div class="npc-scene"' + scene + ">" + face + badge +
          '<div class="npc-pics">' +
          '<label class="file-btn" title="Загрузить свой портрет">' + FACE + '<input type="file" accept="image/*" data-pic="portrait" data-i="' + index + '" aria-label="Портрет"></label>' +
          '<label class="file-btn" title="Загрузить свой фон карточки">' + SCENE + '<input type="file" accept="image/*" data-pic="backdrop" data-i="' + index + '" aria-label="Фон"></label>' +
          (row.portrait ? '<button type="button" data-act="clear-pic" data-pic="portrait" data-i="' + index + '" title="Убрать портрет" aria-label="Убрать портрет">×</button>' : "") +
          (row.backdrop ? '<button type="button" data-act="clear-pic" data-pic="backdrop" data-i="' + index + '" title="Убрать фон" aria-label="Убрать фон">×</button>' : "") +
          "</div></div>" +
          '<div class="npc-fields"><div class="codex-row"><input data-field="name" data-i="' + index + '" type="text" value="' + esc(row.name || "") + '" title="Имя в справочнике и на карте" aria-label="Имя"><button type="button" data-act="rehome" data-kind="npc" data-id="' + esc(row.id) + '" title="Перенести на другое место">Перенести</button><button type="button" data-act="del" data-i="' + index + '" title="Удалить запись" aria-label="Удалить">×</button></div>' +
          homeLine +
          '<div class="npc-stats">' + rest + "</div>" +
          (window.ShirmoNpc ? window.ShirmoNpc.html(row, images, index) : "") +
          tradeHtml(row, index) +
          "</div></article>";
      }).join("");
    }
    function tableHtml() {
      const rows = list();
      const fields = FIELDS[tab];
      if (!rows.length) return '<p class="note">Пока пусто.</p>';
      const head = fields.map(function (field) { return '<th title="' + esc(hint(field[0]) || field[1]) + '">' + esc(field[1]) + "</th>"; }).join("") + "<th></th>";
      const body = rows.map(function (row, index) {
        const cells = fields.map(function (field) {
          const kind = field[2] === "number" ? ' type="number" min="0" class="num"' : ' type="text"';
          const face = field[0] === "name" && row.portrait ? '<img class="cat-thumb" alt="" src="' + esc(row.portrait) + '">' : "";
          return '<td><span class="codex-name">' + face + '<input data-field="' + field[0] + '" data-i="' + index + '"' + kind + ' value="' + esc(row[field[0]] == null ? "" : row[field[0]]) + '" title="' + esc(hint(field[0]) || field[1]) + '" aria-label="' + esc(field[1]) + '"></span></td>';
        }).join("");
        return "<tr>" + cells + '<td class="codex-acts"><button type="button" data-act="del" data-i="' + index + '" title="Удалить запись" aria-label="Удалить">×</button></td></tr>';
      }).join("");
      return '<div class="codex-scroll"><table class="codex-table"><thead><tr>' + head + "</tr></thead><tbody>" + body + "</tbody></table></div>";
    }
    function namesHtml() {
      return '<article class="name-gen">' +
        '<label title="Мягкое звучит плавно, резкое — твёрдо, короткое — в одно-два слога">Звучание<select id="codex-style" aria-label="Звучание имени">' +
        '<option value="soft"' + (nameStyle === "soft" ? " selected" : "") + ">Мягкое</option>" +
        '<option value="hard"' + (nameStyle === "hard" ? " selected" : "") + ">Резкое</option>" +
        '<option value="short"' + (nameStyle === "short" ? " selected" : "") + ">Короткое</option>" +
        "</select></label>" +
        '<p class="note">Мягкое звучит плавно, резкое — твёрдо, короткое — в одно-два слога.</p>' +
        '<div class="codex-row"><input id="codex-name" type="text" value="' + esc(draftName) + '" title="Своё имя или результат случайной сборки" aria-label="Сгенерированное имя" placeholder="Имя"><button type="button" class="codex-die" data-act="gen-name" title="Собрать новое имя">' + D6 + "Случайное</button></div>" +
        '<div class="codex-row"><button type="button" data-act="name-to" data-to="places" title="Создать место с этим именем">В места</button><button type="button" data-act="name-to" data-to="npc" title="Создать НПС с этим именем">В НПС</button><button type="button" data-act="name-to" data-to="merchant" title="Создать торговца с этим именем">В торговцы</button><button type="button" data-act="name-to" data-to="enemy" title="Создать врага с этим именем">Во враги</button></div>' +
        "</article>";
    }
    function coinsHtml() {
      const book = ctx.campaign.codex;
      const fresh = !Array.isArray(book.coins);
      const coins = window.ShirmoCoins.ensure(ctx.campaign);
      if (fresh) saveSoon();
      const rows = coins.map(function (coin, index) {
        return "<tr><td><input data-coin=\"name\" data-i=\"" + index + "\" value=\"" + esc(coin.name || "") + "\" aria-label=\"Монета\"></td>" +
          "<td><input data-coin=\"code\" data-i=\"" + index + "\" value=\"" + esc(coin.code || "") + "\" aria-label=\"Код\"></td>" +
          "<td><input class=\"num\" data-coin=\"copper\" data-i=\"" + index + "\" type=\"number\" min=\"1\" value=\"" + esc(coin.copper || 1) + "\" aria-label=\"Медных в одной монете\"></td>" +
          "<td><button type=\"button\" data-act=\"coin-del\" data-i=\"" + index + "\" title=\"Убрать монету\" aria-label=\"Убрать\">×</button></td></tr>";
      }).join("");
      return '<p class="coin-line">' + esc(window.ShirmoCoins.equation(ctx.campaign)) + "</p>" +
        '<p class="note">Число — сколько медных равно одной такой монете. Строка сверху собирает отношение: сколько монет каждого вида равно одной самой крупной.</p>' +
        '<table class="cast"><thead><tr><th>Монета</th><th>Код</th><th>Медных в одной</th><th></th></tr></thead><tbody>' +
        rows + "</tbody></table>" +
        '<button type="button" data-act="coin-add" title="Новая монета">Добавить</button>';
    }
    function catalogHtml() {
      if (catalogError) return '<p class="note">Каталог не загрузился.</p>';
      if (!(window.allMonsters && window.allItems && window.allSpells)) {
        loadCatalog().then(function () { if (alive) paint(); }, function () { if (!alive) return; catalogError = true; paint(); });
        return '<p class="note">Каталог загружается.</p>';
      }
      return '<label title="Искать в каталоге. От двух букв">Поиск<input id="cat-q" type="text" value="' + esc(query) + '" placeholder="Две буквы и больше" autocomplete="off"></label>' +
        '<div id="cat-results"></div><div id="cat-preview" class="cat-preview" hidden></div>' + takenHtml();
    }
    function paint() {
      const nav = TABS.map(function (item) {
        return '<button type="button" data-tab="' + item[0] + '" class="' + (tab === item[0] ? "is-on" : "") + '" title="' + esc(item[1]) + '">' + item[2] + "<span>" + esc(item[1]) + "</span></button>";
      }).join("");
      const current = TABS.find(function (item) { return item[0] === tab; });
      const placeOptions = '<option value="">Без места</option>' + book().places.map(function (place) {
        return '<option value="' + esc(place.id) + '"' + (place.id === squadPlace ? " selected" : "") + ">" + esc(place.name || "Место") + "</option>";
      }).join("");
      const squad = '<label title="Как называется группа врагов">Имя отряда<input id="codex-squad" type="text" value="' + esc(squadName) + '" placeholder="Волки"></label>' +
        '<label title="Сколько одинаковых врагов создать">Сколько <input id="codex-count" class="num" type="number" min="1" max="12" value="' + esc(squadCount) + '"></label>' +
        '<label title="Хиты каждого врага в отряде">ХП <input id="codex-hp" class="num" type="number" min="0" value="' + esc(squadHp) + '"></label>' +
        '<label title="Урон каждого, например 1к6">Урон<input id="codex-damage" type="text" value="' + esc(squadDamage) + '" placeholder="1к6"></label>' +
        '<label title="Локация, к которой привяжется отряд">Место<select id="codex-place" aria-label="Место отряда">' + placeOptions + "</select></label>" +
        '<button type="button" data-act="squad" title="Создать врагов и связать их в отряд">Собрать отряд</button>';
      const body = tab === "places" ? placesHtml() : (tab === "squads" ? squadsHtml() : (tab === "names" ? namesHtml() : (tab === "wares" ? waresHtml() : (tab === "coins" ? coinsHtml() : (catalogKind() ? catalogHtml() : (isPerson(tab) ? peopleHtml() : tableHtml()))))));
      host.innerHTML = '<aside class="side codex-nav">' + nav + "</aside>" +
        '<div class="codex-main"><div class="codex-head"><b class="codex-tab-name">' + esc(current[1]) + "</b>" +
        (catalogKind() || tab === "squads" || tab === "names" || tab === "wares" || tab === "coins" ? "" : '<button type="button" data-act="add" title="Новая запись на этой вкладке">Добавить</button>') + "</div>" +
        (tab === "places" ? '<p class="note">Места с карты попадают сюда сами. Сюда же ставятся персонажи.</p>' : "") +
        (tab === "squads" ? '<div class="codex-tools">' + squad + "</div>" : "") +
        body +
        '<p class="error" id="codex-err"></p></div><footer class="codex-foot">Использованы материалы с сайта <a href="https://tentaculus.ru/">tentaculus.ru</a>, CC BY-NC-SA 3.0.</footer>';
      if (catalogKind()) paintResults();
      if (isPerson(tab) && window.ShirmoNpc) {
        host.querySelectorAll("[data-npc-sheet]").forEach(function (node) {
          const row = list()[Number(node.getAttribute("data-i"))];
          if (!row) return;
          window.ShirmoNpc.bind(node, row, {
            images: function () { return (ctx.campaign.library && ctx.campaign.library.images) || []; },
            upload: ctx.upload,
            keep: function (url, name) { keepImage(row, url, name); },
            change: function () {
              window.ShirmoNpc.apply(row);
              const index = node.getAttribute("data-i");
              const slot = host.querySelector('.npc-portrait[data-i="' + index + '"]');
              if (!slot) {
                saveSoon();
                return;
              }
              if (row.portrait && slot.tagName !== "BUTTON") {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "npc-portrait";
                button.setAttribute("data-act", "face");
                button.setAttribute("data-i", index);
                button.title = "Настроить, какая часть портрета видна";
                const img = document.createElement("img");
                img.alt = "";
                img.src = row.portrait;
                img.setAttribute("style", faceStyle(row));
                button.appendChild(img);
                slot.replaceWith(button);
              } else if (row.portrait) {
                const img = slot.querySelector("img");
                if (img) {
                  img.src = row.portrait;
                  img.setAttribute("style", faceStyle(row));
                }
              } else if (slot.tagName === "BUTTON") {
                const empty = document.createElement("span");
                empty.className = "npc-portrait npc-portrait-empty";
                empty.setAttribute("data-i", index);
                empty.setAttribute("aria-hidden", "true");
                slot.replaceWith(empty);
              }
              const scene = (slot.isConnected ? slot : host.querySelector('.npc-portrait[data-i="' + index + '"]'));
              const card = scene && scene.closest(".npc-scene");
              const oldBadge = card && card.querySelector(".npc-emoji");
              if (row.emoji && card) {
                const node = oldBadge || card.appendChild(document.createElement("span"));
                node.className = "npc-emoji";
                node.textContent = row.emoji;
              } else if (oldBadge) oldBadge.remove();
              saveSoon();
            }
          });
        });
      }
    }
    function readGenerators() {
      const style = host.querySelector("#codex-style");
      const name = host.querySelector("#codex-name");
      const squad = host.querySelector("#codex-squad");
      const count = host.querySelector("#codex-count");
      const hp = host.querySelector("#codex-hp");
      const damage = host.querySelector("#codex-damage");
      const place = host.querySelector("#codex-place");
      if (style) nameStyle = style.value;
      if (name) draftName = name.value;
      if (squad) squadName = squad.value;
      if (count) squadCount = Math.max(1, Math.min(12, Number(count.value) || 1));
      if (hp) squadHp = Number(hp.value) || 0;
      if (damage) squadDamage = damage.value;
      if (place) squadPlace = place.value;
    }
    function claimSheet(npc, id) {
      if (!npc) return null;
      if (!book().wares) book().wares = [];
      if (id === "__new") {
        const sheet = { id: crypto.randomUUID(), name: npc.name || "Лист", npcId: npc.id, items: [] };
        book().wares.push(sheet);
        if (!npc.wareId) npc.wareId = sheet.id;
        return sheet;
      }
      const sheet = book().wares.find(function (row) { return row && row.id === id; });
      if (!sheet) return null;
      sheet.npcId = npc.id;
      if (!Array.isArray(sheet.items)) sheet.items = [];
      if (!npc.wareId) npc.wareId = sheet.id;
      return sheet;
    }
    function onInput(event) {
      const field = event.target.closest("[data-field]");
      if (field && host.contains(field)) {
        const row = list()[Number(field.getAttribute("data-i"))];
        if (!row) return;
        const key = field.getAttribute("data-field");
        row[key] = field.type === "number" ? (Number(field.value) || 0) : field.value;
        if (key === "name" && (tab === "places" || isPerson(tab))) renamePins(isPerson(tab) ? "npcs" : "places", row.id, row.name);
        saveSoon();
        return;
      }
      if (event.target.hasAttribute("data-squad-place")) {
        const squadRow = book().squads[Number(event.target.getAttribute("data-squad-place"))];
        if (squadRow) {
          moveSquadToPlace(squadRow, event.target.value);
          paint();
        }
        saveSoon();
        return;
      }
      if (event.target.hasAttribute("data-npc-ware")) {
        const person = list()[Number(event.target.getAttribute("data-i"))];
        if (person) person.wareId = event.target.value;
        saveSoon();
        return;
      }
      if (event.target.hasAttribute("data-good-qty") || event.target.hasAttribute("data-good-hide") || event.target.hasAttribute("data-good-name") || event.target.hasAttribute("data-good-note")) {
        const person = list()[Number(event.target.getAttribute("data-i"))];
        const item = person && person.goods && person.goods[Number(event.target.getAttribute("data-item"))];
        if (!item) return;
        if (event.target.hasAttribute("data-good-hide")) item.hideEmpty = event.target.checked;
        else if (event.target.hasAttribute("data-good-name")) item.name = event.target.value;
        else if (event.target.hasAttribute("data-good-note")) item.note = event.target.value;
        else item.qty = event.target.value === "" ? "" : Math.max(0, Math.round(Number(event.target.value) || 0));
        saveSoon();
        return;
      }
      if (event.target.hasAttribute("data-good-sheet")) {
        const person = list()[Number(event.target.getAttribute("data-i"))];
        const goods = person && person.goods;
        const item = goods && goods[Number(event.target.getAttribute("data-item"))];
        if (!person || !item || !event.target.value) return;
        const at = goods.indexOf(item);
        if (at >= 0) goods.splice(at, 1);
        const sheet = claimSheet(person, event.target.value);
        if (sheet) sheet.items.push(item);
        else goods.push(item);
        paint();
        saveSoon();
        return;
      }
      if (event.target.hasAttribute("data-own-sheet")) {
        const person = book().npcs[Number(event.target.getAttribute("data-own"))];
        const goods = person && person.goods;
        const item = goods && goods[Number(event.target.getAttribute("data-item"))];
        if (!person || !item || !event.target.value) return;
        const at = goods.indexOf(item);
        if (at >= 0) goods.splice(at, 1);
        const sheet = claimSheet(person, event.target.value);
        if (sheet) sheet.items.push(item);
        else goods.push(item);
        paint();
        saveSoon();
        return;
      }
      if (event.target.hasAttribute("data-coin")) {
        const coin = window.ShirmoCoins.ensure(ctx.campaign)[Number(event.target.getAttribute("data-i"))];
        if (!coin) return;
        const key = event.target.getAttribute("data-coin");
        coin[key] = key === "copper" ? Math.max(1, Math.round(Number(event.target.value) || 1)) : event.target.value;
        const line = host.querySelector(".coin-line");
        if (line) line.textContent = window.ShirmoCoins.equation(ctx.campaign);
        saveSoon();
        return;
      }
      if (event.target.hasAttribute("data-own-field")) {
        const person = book().npcs[Number(event.target.getAttribute("data-own"))];
        const item = person && person.goods && person.goods[Number(event.target.getAttribute("data-item"))];
        if (!item) return;
        const key = event.target.getAttribute("data-own-field");
        if (key === "price" || key === "coin") window.ShirmoCoins.take(item, event.target);
        else if (key === "qty") item.qty = event.target.value === "" ? "" : Math.max(0, Math.round(Number(event.target.value) || 0));
        else item[key] = event.target.value;
        if (key === "ink") {
          const row = event.target.closest(".ware-item, .ware-row");
          if (row) row.style.color = event.target.value;
        }
        saveSoon();
        return;
      }
      if (event.target.hasAttribute("data-own-hide")) {
        const person = book().npcs[Number(event.target.getAttribute("data-own"))];
        const item = person && person.goods && person.goods[Number(event.target.getAttribute("data-item"))];
        if (!item) return;
        item.hideEmpty = event.target.checked;
        saveSoon();
        return;
      }
      if (event.target.hasAttribute("data-item-find")) {
        const box = event.target.parentNode.querySelector(".ware-hits");
        const q = event.target.value.trim().toLowerCase();
        if (!box || !window.ShirmoItems || q.length < 2) {
          if (box) { box.hidden = true; box.innerHTML = ""; }
          return;
        }
        window.ShirmoItems.ready().then(function () {
          if (!host.contains(event.target)) return;
          const hits = window.ShirmoItems.find(q).slice(0, 8);
          box._hits = hits;
          box.hidden = !hits.length;
          box.innerHTML = hits.map(function (row, index) {
            const icon = window.ShirmoItems.icon(row);
            return '<button type="button" data-pick-hit="' + index + '">' + (icon ? '<img alt="" src="' + esc(icon) + '">' : "") + esc(window.ShirmoItems.title(row)) + "</button>";
          }).join("");
        });
        return;
      }
      if (event.target.hasAttribute("data-ware-hide")) {
        const sheet = book().wares[Number(event.target.getAttribute("data-stock"))];
        const item = sheet && sheet.items && sheet.items[Number(event.target.getAttribute("data-item"))];
        if (!item) return;
        item.hideEmpty = event.target.checked;
        saveSoon();
        return;
      }
      if (event.target.hasAttribute("data-ware") && !event.target.hasAttribute("data-ware-lib") && !event.target.hasAttribute("data-ware-cat") && !event.target.hasAttribute("data-ware-file")) {
        const sheet = book().wares[Number(event.target.getAttribute("data-stock"))];
        const item = sheet && sheet.items && sheet.items[Number(event.target.getAttribute("data-item"))];
        if (!item) return;
        const key = event.target.getAttribute("data-ware");
        if (key === "price" || key === "coin") window.ShirmoCoins.take(item, event.target);
        else item[key] = key === "qty" ? (event.target.value === "" ? "" : Math.max(0, Math.round(Number(event.target.value) || 0))) : event.target.value;
        if (key === "ink") {
          const row = event.target.closest(".ware-row");
          if (row) row.style.color = event.target.value;
        }
        saveSoon();
        return;
      }
      if (event.target.hasAttribute("data-ware-owner")) {
        const sheet = book().wares[Number(event.target.getAttribute("data-i"))];
        const person = book().npcs.find(function (row) { return row.id === event.target.value; });
        if (sheet && person) person.wareId = sheet.id;
        paint();
        saveSoon();
        return;
      }
      if (event.target.hasAttribute("data-ware-lib") || event.target.hasAttribute("data-ware-cat")) {
        const sheet = book().wares[Number(event.target.getAttribute("data-stock"))];
        const item = sheet && sheet.items && sheet.items[Number(event.target.getAttribute("data-item"))];
        if (!item || !event.target.value) return;
        item.icon = event.target.value;
        paint();
        saveSoon();
        return;
      }
      if (event.target.type === "file" && event.target.hasAttribute("data-ware-file")) {
        const file = event.target.files && event.target.files[0];
        const sheet = book().wares[Number(event.target.getAttribute("data-stock"))];
        const item = sheet && sheet.items && sheet.items[Number(event.target.getAttribute("data-item"))];
        if (!file || !item) return;
        if (!ctx.upload) return;
        ctx.upload(file).then(function (url) {
          if (!alive) return;
          item.icon = url;
          if (!ctx.campaign.library) ctx.campaign.library = { fonts: [], images: [], notes: [] };
          if (window.ShirmoLib) window.ShirmoLib.keep(ctx.campaign.library, {
            url: url,
            name: item.name || file.name.replace(/\.[^.]+$/, ""),
            section: "icons",
            sectionName: "Иконки товаров"
          });
          paint();
          saveSoon();
        });
        return;
      }
      if (event.target.type === "file" && event.target.hasAttribute("data-ware-csv")) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function () {
          if (!alive) return;
          const items = parseCsv(String(reader.result || ""));
          const fail = host.querySelector("#codex-err");
          if (!items.length) {
            if (fail) fail.textContent = "В файле нет строк с названием.";
            return;
          }
          book().wares.push({ id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, "") || "Лист", items: items });
          paint();
          saveSoon();
        };
        reader.readAsText(file);
        return;
      }
      if (event.target.type === "file" && event.target.hasAttribute("data-pic")) {
        const file = event.target.files && event.target.files[0];
        const row = list()[Number(event.target.getAttribute("data-i"))];
        const slot = event.target.getAttribute("data-pic");
        if (!file || !row || (slot !== "portrait" && slot !== "backdrop")) return;
        const fail = host.querySelector("#codex-err");
        if (!ctx.upload) {
          if (fail) fail.textContent = "Загрузка недоступна.";
          return;
        }
        ctx.upload(file).then(function (url) {
          if (!alive) return;
          row[slot] = url;
          if (slot === "portrait" && isPerson(tab) && window.ShirmoNpc) {
            window.ShirmoNpc.apply(row);
            row.portrait = url;
            window.ShirmoNpc.write(row);
          }
          keepImage(row, url, file.name.replace(/\.[^.]+$/, ""));
          paint();
          saveSoon();
        }, function (error) {
          const node = host.querySelector("#codex-err");
          if (node) node.textContent = error.message || "Не удалось загрузить.";
        });
        return;
      }
      if (event.target.id === "cat-q") {
        query = event.target.value;
        paintResults();
        return;
      }
      if (host.contains(event.target)) readGenerators();
    }
    function openFace(index) {
      const row = list()[index];
      if (!row || !row.portrait) return;
      const old = document.getElementById("face-pop");
      if (old) old.remove();
      const focus = focusNums(row);
      const pop = document.createElement("div");
      pop.id = "face-pop";
      pop.className = "pop";
      pop.innerHTML = '<div class="pop-card face-card" role="dialog" aria-label="Кадр портрета">' +
        '<div class="pop-head"><h2>' + esc(row.name || "Портрет") + '</h2><button type="button" data-pop-close title="Закрыть" aria-label="Закрыть">×</button></div>' +
        '<div class="face-pick" id="face-pick" title="Потяните круг, чтобы выбрать, какая часть портрета видна"><img alt="" src="' + esc(row.portrait) + '" style="' + faceStyle(row) + '"></div>' +
        '<p class="note">Потяните круг, чтобы выбрать часть портрета.</p>' +
        '<label title="Крупнее показывает выбранную часть портрета в рамке">Крупность<input id="face-zoom" type="range" min="100" max="300" value="' + Math.round(focus.zoom * 100) + '"></label>' +
        '<details class="drop"><summary title="Сдвиг портрета внутри круглой рамки">Смещение</summary>' +
        '<label title="Вправо сдвигает портрет вправо">Смещение по ширине<input id="face-x" type="range" min="0" max="100" value="' + Math.round(100 - focus.x) + '"></label>' +
        '<label title="Вправо сдвигает портрет вниз">Смещение по высоте<input id="face-y" type="range" min="0" max="100" value="' + Math.round(100 - focus.y) + '"></label></details></div>';
      document.body.appendChild(pop);
      function close() { pop.remove(); }
      pop.addEventListener("click", function (event) { if (event.target === pop) close(); });
      pop.querySelector("[data-pop-close]").addEventListener("click", close);
      function refresh() {
        const img = pop.querySelector("#face-pick img");
        if (img) img.setAttribute("style", faceStyle(row));
        const card = host.querySelector('.npc-portrait[data-i="' + index + '"] img');
        if (card) card.setAttribute("style", faceStyle(row));
        const face = focusNums(row);
        const shiftX = pop.querySelector("#face-x");
        const shiftY = pop.querySelector("#face-y");
        const zoomNode = pop.querySelector("#face-zoom");
        if (shiftX && document.activeElement !== shiftX) shiftX.value = String(Math.round(100 - face.x));
        if (shiftY && document.activeElement !== shiftY) shiftY.value = String(Math.round(100 - face.y));
        if (zoomNode && document.activeElement !== zoomNode) zoomNode.value = String(Math.round(face.zoom * 100));
        if (isPerson(tab) && window.ShirmoNpc) window.ShirmoNpc.write(row);
        saveSoon();
      }
      function bindShift(node, key) {
        node.addEventListener("input", function () {
          row[key] = 100 - Number(node.value);
          refresh();
        });
      }
      pop.querySelector("#face-zoom").addEventListener("input", function (event) {
        row.portraitZoom = Number(event.target.value) / 100;
        refresh();
      });
      bindShift(pop.querySelector("#face-x"), "portraitX");
      bindShift(pop.querySelector("#face-y"), "portraitY");
      const pick = pop.querySelector("#face-pick");
      let pan = null;
      pick.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) return;
        event.preventDefault();
        const face = focusNums(row);
        pan = { x: event.clientX, y: event.clientY, ox: face.x, oy: face.y, zoom: face.zoom };
        pick.setPointerCapture(event.pointerId);
      });
      pick.addEventListener("pointermove", function (event) {
        if (!pan) return;
        const rect = pick.getBoundingClientRect();
        const scale = pan.zoom || 1;
        row.portraitX = Math.min(100, Math.max(0, pan.ox - (event.clientX - pan.x) / rect.width * 100 / scale));
        row.portraitY = Math.min(100, Math.max(0, pan.oy - (event.clientY - pan.y) / rect.height * 100 / scale));
        refresh();
      });
      function endPan() { pan = null; }
      pick.addEventListener("pointerup", endPan);
      pick.addEventListener("pointercancel", endPan);
    }
    function itemPreview(row) {
      const img = window.ShirmoItems.icon(row);
      const rarity = window.oRarity && row.en && window.oRarity[String(row.en.rarity)];
      const meta = (rarity && rarity.text && rarity.text.ru && rarity.text.ru.title) || "";
      const price = window.ShirmoItems.price(row);
      return (img ? '<img alt="" src="' + esc(img) + '" onerror="this.remove()">' : "") +
        "<h3>" + esc(window.ShirmoItems.title(row)) + "</h3><p>" + esc([meta, price].filter(Boolean).join(" · ")) + "</p><p>" + esc(plain(row.ru && row.ru.text)) + "</p>";
    }
    function catalogByIcon(url) {
      if (!url || !window.allItems) return null;
      const file = decodeURIComponent(String(url).split("?")[0].split("/").pop() || "");
      if (!file) return null;
      return window.allItems.find(function (row) { return row.en && row.en.img === file; }) || null;
    }
    function goodFrom(node) {
      if (!node) return null;
      if (node.hasAttribute("data-stock")) {
        const sheet = book().wares[Number(node.getAttribute("data-stock"))];
        return sheet && sheet.items && sheet.items[Number(node.getAttribute("data-item"))];
      }
      if (node.hasAttribute("data-own")) {
        const person = book().npcs[Number(node.getAttribute("data-own"))];
        return person && person.goods && person.goods[Number(node.getAttribute("data-item"))];
      }
      return null;
    }
    function openIconPop(node) {
      const item = goodFrom(node);
      if (!item || !window.ShirmoItems) return;
      const old = document.getElementById("item-pop");
      if (old) old.remove();
      const pop = document.createElement("div");
      pop.id = "item-pop";
      pop.className = "pop";
      pop.innerHTML = '<div class="pop-card item-pop" role="dialog" aria-label="Предмет"><div class="pop-head"><h2>Предмет</h2><button type="button" data-pop-close title="Закрыть">×</button></div>' +
        '<div class="item-card" data-item-card><p class="note">Список предметов загружается.</p></div>' +
        '<label title="Найти предмет в общем списке">Поиск<input data-icon-q type="text" placeholder="Две буквы и больше" autocomplete="off"></label>' +
        '<div class="item-hits" data-icon-hits></div></div>';
      document.body.appendChild(pop);
      const card = pop.querySelector("[data-item-card]");
      const hitsBox = pop.querySelector("[data-icon-hits]");
      function close() { if (pop.parentNode) pop.remove(); }
      pop.addEventListener("click", function (event) { if (event.target === pop) close(); });
      pop.querySelector("[data-pop-close]").addEventListener("click", close);
      function useRow(row) {
        const prev = catalogByIcon(item.icon);
        const prevTitle = prev ? window.ShirmoItems.title(prev) : "";
        const prevPrice = prev ? window.ShirmoItems.price(prev) : "";
        const icon = window.ShirmoItems.icon(row);
        if (icon) item.icon = icon;
        if (!String(item.name || "").trim() || item.name === prevTitle) item.name = window.ShirmoItems.title(row);
        if ((!String(item.price || "").trim() && !item.coin) || item.price === prevPrice) window.ShirmoCoins.adopt(item, window.ShirmoItems.price(row), ctx.campaign);
        close();
        paint();
        saveSoon();
      }
      hitsBox.addEventListener("click", function (event) {
        const button = event.target.closest("[data-icon-hit]");
        if (!button) return;
        const row = (hitsBox._hits || [])[Number(button.getAttribute("data-icon-hit"))];
        if (row) useRow(row);
      });
      pop.querySelector("[data-icon-q]").addEventListener("input", function (event) {
        const q = event.target.value.trim().toLowerCase();
        if (q.length < 2) { hitsBox.innerHTML = ""; return; }
        window.ShirmoItems.ready().then(function () {
          if (!pop.parentNode) return;
          const hits = window.ShirmoItems.find(q).slice(0, 12);
          hitsBox._hits = hits;
          hitsBox.innerHTML = hits.length ? hits.map(function (row, index) {
            const icon = window.ShirmoItems.icon(row);
            return '<button type="button" data-icon-hit="' + index + '">' + (icon ? '<img alt="" src="' + esc(icon) + '">' : "") + esc(window.ShirmoItems.title(row)) + "</button>";
          }).join("") : '<p class="note">Ничего не найдено.</p>';
        });
      });
      window.ShirmoItems.ready().then(function () {
        if (!pop.parentNode) return;
        const row = catalogByIcon(item.icon);
        card.innerHTML = row ? itemPreview(row) : '<p class="note">Иконки из справочника пока нет. Найдите предмет ниже.</p>';
      }, function () {
        if (pop.parentNode) card.innerHTML = '<p class="note">Каталог не загрузился.</p>';
      });
    }
    function goodBy(node) {
      if (!node) return null;
      if (node.hasAttribute("data-stock")) {
        const sheet = book().wares[Number(node.getAttribute("data-stock"))];
        return sheet && sheet.items && sheet.items[Number(node.getAttribute("data-item"))];
      }
      if (node.hasAttribute("data-own")) {
        const person = book().npcs[Number(node.getAttribute("data-own"))];
        return person && person.goods && person.goods[Number(node.getAttribute("data-item"))];
      }
      if (node.hasAttribute("data-i") && isPerson(tab)) {
        const person = list()[Number(node.getAttribute("data-i"))];
        return person && person.goods && person.goods[Number(node.getAttribute("data-item"))];
      }
      return null;
    }
    function openWareEdit(item) {
      if (!item) return;
      const old = document.getElementById("good-edit");
      if (old) old.remove();
      const images = (ctx.campaign.library && ctx.campaign.library.images) || [];
      const lib = images.map(function (image) {
        return '<option value="' + esc(image.url) + '"' + (image.url === item.icon ? " selected" : "") + ">" + esc(image.name || "Картинка") + "</option>";
      }).join("");
      const face = item.icon ? '<img alt="" src="' + esc(item.icon) + '">' : "";
      const pop = document.createElement("div");
      pop.id = "good-edit";
      pop.className = "pop";
      pop.innerHTML = '<div class="pop-card ware-edit" role="dialog" aria-label="Иконка и цвет">' +
        '<div class="pop-head"><h2>Иконка и цвет</h2><button type="button" data-pop-close title="Закрыть" aria-label="Закрыть">×</button></div>' +
        '<div class="ware-edit-face">' + face + "</div>" +
        '<label title="Цвет строки товара">Цвет<input data-edit-ink type="color" value="' + esc(item.ink || "#f3ead8") + '"></label>' +
        '<label class="file-btn" title="Своя иконка. Попадёт в библиотеку, в раздел «Иконки товаров»">Загрузить<input data-edit-file type="file" accept="image/*" aria-label="Загрузить иконку"></label>' +
        '<label title="Иконка из библиотеки">Библиотека<select data-edit-lib><option value="">Нет</option>' + lib + "</select></label>" +
        '<div class="ware-find"><input data-edit-find type="text" placeholder="Поиск предмета" aria-label="Поиск предмета для иконки" title="Иконка из общего списка предметов"><div class="ware-hits" hidden></div></div></div>';
      document.body.appendChild(pop);
      function shut() { if (pop.parentNode) pop.remove(); }
      pop.addEventListener("click", function (event) { if (event.target === pop) shut(); });
      pop.querySelector("[data-pop-close]").addEventListener("click", shut);
      function shown() {
        const slot = pop.querySelector(".ware-edit-face");
        if (slot) slot.innerHTML = item.icon ? '<img alt="" src="' + esc(item.icon) + '">' : "";
        paint();
        saveSoon();
      }
      pop.querySelector("[data-edit-ink]").addEventListener("input", function (event) {
        item.ink = event.target.value;
        saveSoon();
      });
      pop.querySelector("[data-edit-lib]").addEventListener("change", function (event) {
        if (!event.target.value) return;
        item.icon = event.target.value;
        shown();
      });
      pop.querySelector("[data-edit-file]").addEventListener("change", function (event) {
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
      const find = pop.querySelector("[data-edit-find]");
      find.addEventListener("input", function () {
        const box = find.parentNode.querySelector(".ware-hits");
        const q = find.value.trim().toLowerCase();
        if (!window.ShirmoItems || q.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
        window.ShirmoItems.ready().then(function () {
          if (!pop.isConnected) return;
          const hits = window.ShirmoItems.find(q).slice(0, 8);
          box._hits = hits;
          box.hidden = !hits.length;
          box.innerHTML = hits.map(function (row, index) {
            const icon = window.ShirmoItems.icon(row);
            return '<button type="button" data-edit-hit="' + index + '">' + (icon ? '<img alt="" src="' + esc(icon) + '">' : "") + esc(window.ShirmoItems.title(row)) + "</button>";
          }).join("");
        });
      });
      pop.addEventListener("click", function (event) {
        const hit = event.target.closest("[data-edit-hit]");
        if (!hit) return;
        const row = (find.parentNode.querySelector(".ware-hits")._hits || [])[Number(hit.getAttribute("data-edit-hit"))];
        if (!row || !window.ShirmoItems) return;
        const icon = window.ShirmoItems.icon(row);
        if (icon) item.icon = icon;
        if (!String(item.name || "").trim()) item.name = window.ShirmoItems.title(row);
        shown();
      });
    }
    function onClick(event) {
      const fold = event.target.closest("[data-ware-fold]");
      if (fold && host.contains(fold)) {
        const key = fold.getAttribute("data-ware-fold");
        wareOpen[key] = !wareOpen[key];
        paint();
        return;
      }
      const eye = event.target.closest("[data-ware-eye], [data-own-eye], [data-good-eye]");
      if (eye && host.contains(eye)) {
        const item = goodBy(eye);
        if (!item) return;
        item.off = !item.off;
        paint();
        saveSoon();
        return;
      }
      const edit = event.target.closest("[data-ware-edit], [data-good-edit]");
      if (edit && host.contains(edit)) {
        openWareEdit(goodBy(edit));
        return;
      }
      const face = event.target.closest("[data-ware-icon]");
      if (face && host.contains(face)) {
        openIconPop(face);
        return;
      }
      const pick = event.target.closest("[data-pick-hit]");
      if (pick && host.contains(pick)) {
        const box = pick.parentNode;
        const row = (box._hits || [])[Number(pick.getAttribute("data-pick-hit"))];
        const input = box.parentNode.querySelector("[data-item-find]");
        let item = null;
        if (input && input.hasAttribute("data-stock")) {
          const sheet = book().wares[Number(input.getAttribute("data-stock"))];
          item = sheet && sheet.items && sheet.items[Number(input.getAttribute("data-item"))];
        } else if (input && input.hasAttribute("data-own")) {
          const person = book().npcs[Number(input.getAttribute("data-own"))];
          item = person && person.goods && person.goods[Number(input.getAttribute("data-item"))];
        }
        if (item && row && window.ShirmoItems) {
          const icon = window.ShirmoItems.icon(row);
          if (icon) item.icon = icon;
          if (!String(item.name || "").trim()) item.name = window.ShirmoItems.title(row);
          if (!String(item.price || "").trim() && !item.coin) window.ShirmoCoins.adopt(item, window.ShirmoItems.price(row), ctx.campaign);
          paint();
          saveSoon();
        }
        return;
      }
      const button = event.target.closest("[data-tab], [data-act]");
      if (!button || !host.contains(button)) return;
      readGenerators();
      const nextTab = button.getAttribute("data-tab");
      if (nextTab) {
        tab = nextTab;
        paint();
        return;
      }
      const act = button.getAttribute("data-act");
      if (act === "rehome") {
        const kind = button.getAttribute("data-kind");
        const id = button.getAttribute("data-id");
        if (kind && id) pickPlaceHome(kind === "place" ? "place" : "npc", id, button);
        return;
      }
      if (act === "seat") {
        const index = Number(button.getAttribute("data-i"));
        const place = book().places[index];
        const sel = host.querySelector('[data-seat="' + index + '"]');
        const id = sel && sel.value;
        if (!place || !id) return;
        moveNpcToPlace(id, place.id);
        paint();
        saveSoon();
        return;
      }
      if (act === "unseat") {
        const id = button.getAttribute("data-npc");
        if (!id) return;
        moveNpcToPlace(id, "");
        paint();
        saveSoon();
        return;
      }
      if (act === "take") {
        const row = hits[Number(button.getAttribute("data-i"))];
        if (!row) return;
        takeHit(row);
        paint();
        saveSoon();
        return;
      }
      if (act === "give") {
        const row = hits[Number(button.getAttribute("data-i"))];
        const sel = host.querySelector('[data-give="' + button.getAttribute("data-i") + '"]');
        const person = book().npcs.find(function (item) { return item.id === (sel && sel.value); });
        if (!row || !person) {
          const fail = host.querySelector("#codex-err");
          if (fail && row) fail.textContent = "Сначала выберите НПС.";
          return;
        }
        if (!Array.isArray(person.goods)) person.goods = [];
        const rarity = window.oRarity && window.oRarity[String(row.en && row.en.rarity)];
        const given = {
          id: crypto.randomUUID(),
          name: hitTitle(row) || "Предмет",
          price: "",
          coin: "",
          note: "",
          icon: row.en && row.en.img ? "/catalog/img/items/" + encodeURIComponent(row.en.img) : "",
          qty: "",
          hideEmpty: false
        };
        window.ShirmoCoins.adopt(given, (rarity && rarity.coast) || "", ctx.campaign);
        person.goods.push(given);
        paint();
        saveSoon();
        return;
      }
      if (act === "drop-good") {
        const person = list()[Number(button.getAttribute("data-i"))];
        if (!person || !Array.isArray(person.goods)) return;
        person.goods.splice(Number(button.getAttribute("data-item")), 1);
        paint();
        saveSoon();
        return;
      }
      if (act === "drop-own") {
        const person = book().npcs[Number(button.getAttribute("data-own"))];
        if (!person || !Array.isArray(person.goods)) return;
        person.goods.splice(Number(button.getAttribute("data-item")), 1);
        paint();
        saveSoon();
        return;
      }
      if (act === "show-sheet" || act === "show-own") {
        const items = act === "show-sheet"
          ? ((book().wares[Number(button.getAttribute("data-i"))] || {}).items || [])
          : ((book().npcs[Number(button.getAttribute("data-i"))] || {}).goods || []);
        if (ctx.showGoods) ctx.showGoods(items.filter(function (item) {
          if (!item || item.off || !String(item.name || "").trim()) return false;
          if (!item.hideEmpty) return true;
          return !(item.qty === 0 || item.qty === "0");
        }).map(function (item) {
          return { name: item.name, price: window.ShirmoCoins.text(item, ctx.campaign), icon: item.icon || "" };
        }));
        return;
      }
      if (act === "coin-add") {
        window.ShirmoCoins.ensure(ctx.campaign).push({ id: crypto.randomUUID(), name: "Монета", code: "", copper: 1 });
        paint();
        saveSoon();
        return;
      }
      if (act === "coin-del") {
        window.ShirmoCoins.ensure(ctx.campaign).splice(Number(button.getAttribute("data-i")), 1);
        paint();
        saveSoon();
        return;
      }
      if (act === "ware-sheet") {
        book().wares.push({ id: crypto.randomUUID(), name: "Лист", items: [] });
        paint();
        saveSoon();
        return;
      }
      if (act === "ware-add") {
        const sheet = book().wares[Number(button.getAttribute("data-i"))];
        if (!sheet) return;
        sheet.items = sheet.items || [];
        sheet.items.push({ id: crypto.randomUUID(), name: "", price: "", note: "", icon: "", qty: "", hideEmpty: false });
        paint();
        saveSoon();
        return;
      }
      if (act === "ware-del") {
        const sheet = book().wares[Number(button.getAttribute("data-stock"))];
        if (!sheet || !sheet.items) return;
        sheet.items.splice(Number(button.getAttribute("data-item")), 1);
        paint();
        saveSoon();
        return;
      }
      if (act === "face") {
        openFace(Number(button.getAttribute("data-i")));
        return;
      }
      if (act === "clear-pic") {
        const row = list()[Number(button.getAttribute("data-i"))];
        const slot = button.getAttribute("data-pic");
        if (!row || (slot !== "portrait" && slot !== "backdrop")) return;
        row[slot] = "";
        if (slot === "portrait" && isPerson(tab) && window.ShirmoNpc) window.ShirmoNpc.write(row);
        paint();
        saveSoon();
        return;
      }
      if (act === "add") {
        const row = blank();
        if (isPerson(tab)) book().npcs.push(row);
        else list().push(row);
        paint();
        saveSoon();
        return;
      }
      if (act === "del") {
        const index = Number(button.getAttribute("data-i"));
        const row = list()[index];
        if (!row) return;
        if (tab === "places") {
          unlink("places", row.id);
          book().squads.forEach(function (squad) { if (squad.placeId === row.id) squad.placeId = ""; });
          const lift = row.parentId || "";
          book().places.forEach(function (place) {
            if (place && (place.parentId || "") === row.id) place.parentId = lift;
          });
          book().places.splice(index, 1);
        } else if (isPerson(tab)) {
          unlink("npcs", row.id);
          book().squads.forEach(function (squad) {
            squad.memberIds = (squad.memberIds || []).filter(function (id) { return id !== row.id; });
          });
          book().npcs = book().npcs.filter(function (item) { return item.id !== row.id; });
        } else if (tab === "squads") {
          book().squads.splice(index, 1);
        } else if (tab === "wares") {
          book().npcs.forEach(function (npc) { if (npc.wareId === row.id) npc.wareId = ""; });
          book().wares.splice(index, 1);
        } else {
          list().splice(index, 1);
        }
        paint();
        saveSoon();
        return;
      }
      if (act === "npc") {
        const row = book().monsters[Number(button.getAttribute("data-i"))];
        if (!row) return;
        book().npcs.push({
          id: crypto.randomUUID(),
          name: row.name || "Персонаж",
          note: row.note || "",
          weapon: "",
          damage: row.damage || "",
          hp: Number(row.hp) || 0,
          hpMax: Number(row.hp) || 0
        });
        tab = "npcs";
        paint();
        saveSoon();
        return;
      }
      if (act === "gen-name") {
        draftName = invent(nameStyle);
        paint();
        return;
      }
      if (act === "name-to") {
        const name = draftName.trim();
        if (!name) return;
        const dest = button.getAttribute("data-to");
        if (dest === "places") book().places.push({ id: crypto.randomUUID(), name: name });
        else book().npcs.push({ id: crypto.randomUUID(), role: dest, name: name, note: "", weapon: "", damage: "", hp: 0, hpMax: 0 });
        tab = dest;
        paint();
        saveSoon();
        return;
      }
      if (act === "squad") {
        const base = squadName.trim() || "Отряд";
        const count = squadCount;
        const memberIds = [];
        for (let i = 0; i < count; i++) {
          const id = crypto.randomUUID();
          book().npcs.push({
            id: id,
            role: "enemy",
            name: count === 1 ? base : base + " " + (i + 1),
            note: "",
            weapon: "",
            damage: squadDamage,
            hp: squadHp,
            hpMax: squadHp
          });
          memberIds.push(id);
        }
        const squad = {
          id: crypto.randomUUID(),
          name: base,
          placeId: "",
          memberIds: memberIds
        };
        book().squads.push(squad);
        if (squadPlace) moveSquadToPlace(squad, squadPlace);
        paint();
        saveSoon();
      }
    }
    let wheel = null;
    function closeWheel() {
      if (wheel && wheel.el) wheel.el.remove();
      wheel = null;
    }
    function wheelIndex(x, y) {
      const dx = x - wheel.x;
      const dy = y - wheel.y;
      if (Math.hypot(dx, dy) < 46) return -1;
      const step = (Math.PI * 2) / TABS.length;
      const rel = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
      return Math.round(rel / step) % TABS.length;
    }
    function paintWheel() {
      wheel.el.querySelectorAll("button").forEach(function (button, index) {
        button.classList.toggle("is-hot", index === wheel.index);
      });
      wheel.el.querySelector(".wheel-name").textContent = wheel.index >= 0 ? TABS[wheel.index][1] : "";
    }
    function openWheel(x, y) {
      closeWheel();
      const el = document.createElement("div");
      el.className = "tool-wheel is-icons";
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.innerHTML = '<span class="wheel-name"></span>' + TABS.map(function (item, index) {
        const deg = index * (360 / TABS.length);
        return '<button type="button" style="--a:' + deg + 'deg" title="' + esc(item[1]) + '" aria-label="' + esc(item[1]) + '" class="' + (tab === item[0] ? "is-on" : "") + '">' + item[2] + "</button>";
      }).join("");
      document.body.appendChild(el);
      wheel = { x: x, y: y, el: el, index: -1 };
    }
    function pickWheel(x, y) {
      if (!wheel) return;
      const index = wheelIndex(x, y);
      closeWheel();
      if (index < 0) return;
      readGenerators();
      tab = TABS[index][0];
      paint();
    }
    function onMouseDown(event) {
      if (event.button === 1) event.preventDefault();
    }
    function onPointerDown(event) {
      if (event.button !== 1 || !host.contains(event.target)) return;
      event.preventDefault();
      openWheel(event.clientX, event.clientY);
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
      if (event.button !== 1) return;
      pickWheel(event.clientX, event.clientY);
    }
    function showPreview(event) {
      const hit = event.target.closest(".cat-hit");
      const card = host.querySelector("#cat-preview");
      if (!hit || !card || !host.contains(hit)) return;
      const row = hits[Number(hit.getAttribute("data-i"))];
      if (!row) return;
      card.hidden = false;
      card.innerHTML = previewHtml(row);
      const rect = hit.getBoundingClientRect();
      let left = rect.right + 12;
      if (left + 360 > window.innerWidth) left = Math.max(8, rect.left - 360);
      card.style.left = left + "px";
      card.style.top = Math.max(8, Math.min(rect.top, window.innerHeight - 120)) + "px";
    }
    function hidePreview(event) {
      const hit = event.target.closest(".cat-hit");
      const card = host.querySelector("#cat-preview");
      if (!hit || !card) return;
      const next = event.relatedTarget;
      if (next && (hit.contains(next) || card.contains(next))) return;
      card.hidden = true;
    }
    function onContextMenu(event) {
      const person = event.target.closest(".place-person[data-npc]");
      if (person && host.contains(person)) {
        event.preventDefault();
        pickPlaceHome("npc", person.getAttribute("data-npc"), person);
        return;
      }
      const npcCard = event.target.closest(".npc-card[data-npc]");
      if (npcCard && host.contains(npcCard)) {
        if (event.target.closest("input, textarea, select, button, label")) return;
        event.preventDefault();
        pickPlaceHome("npc", npcCard.getAttribute("data-npc"), npcCard);
        return;
      }
      const placeCard = event.target.closest(".place-card[data-place]");
      if (placeCard && host.contains(placeCard)) {
        if (event.target.closest("input, textarea, select, button, label, .place-person")) return;
        event.preventDefault();
        pickPlaceHome("place", placeCard.getAttribute("data-place"), placeCard);
      }
    }
    host.addEventListener("input", onInput);
    host.addEventListener("change", onInput);
    host.addEventListener("click", onClick);
    host.addEventListener("contextmenu", onContextMenu);
    host.addEventListener("mouseover", showPreview);
    host.addEventListener("mouseout", hidePreview);
    host.addEventListener("mousedown", onMouseDown);
    host.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    host._codexFlush = flush;
    host._codexOff = function () {
      alive = false;
      clearTimeout(timer);
      closeWheel();
      closeHomeMenu();
      const facePop = document.getElementById("face-pop");
      if (facePop) facePop.remove();
      host.removeEventListener("input", onInput);
      host.removeEventListener("change", onInput);
      host.removeEventListener("click", onClick);
      host.removeEventListener("contextmenu", onContextMenu);
      host.removeEventListener("mouseover", showPreview);
      host.removeEventListener("mouseout", hidePreview);
      host.removeEventListener("mousedown", onMouseDown);
      host.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      host._codexFlush = null;
      host._codexOff = null;
    };
    paint();
  }

  return { mount: mount, ensure: ensure, adopt: adopt };
})();
