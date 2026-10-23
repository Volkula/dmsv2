window.ShirmoDungeon = (function () {
  const CELL = { VOID: 0, FLOOR: 1, WALL: 2, DOOR: 3, SECRET: 4, CHASM: 5, BRIDGE: 6 };
  const CELL_NAME = {
    0: "пусто", 1: "пол", 2: "стена", 3: "дверь", 4: "секрет", 5: "пропасть", 6: "мост"
  };
  const DIRS = [
    { x: 0, y: -1, name: "С" },
    { x: 1, y: 0, name: "В" },
    { x: 0, y: 1, name: "Ю" },
    { x: -1, y: 0, name: "З" }
  ];
  const MASTER_MAP = "/dungeon/redbrand-master.webp";
  const CLEAN_MAP = "/dungeon/redbrand-clean.webp";
  const DEFAULT_W = 42;
  const DEFAULT_H = 52;

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function blankCells(w, h, fill) {
    const rows = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) row.push(fill == null ? CELL.VOID : fill);
      rows.push(row);
    }
    return rows;
  }

  function seedStart(cells) {
    const h = cells.length;
    const w = cells[0].length;
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h * 0.78);
    for (let y = cy - 2; y <= cy + 2; y++) {
      for (let x = cx - 2; x <= cx + 2; x++) {
        if (y < 0 || x < 0 || y >= h || x >= w) continue;
        const edge = y === cy - 2 || y === cy + 2 || x === cx - 2 || x === cx + 2;
        cells[y][x] = edge ? CELL.WALL : CELL.FLOOR;
      }
    }
    cells[cy - 2][cx] = CELL.DOOR;
    return { x: cx, y: cy };
  }

  function ensure(campaign) {
    if (!campaign.dungeon || typeof campaign.dungeon !== "object") campaign.dungeon = {};
    const d = campaign.dungeon;
    if (!d.title) d.title = "Redbrand Hideout";
    if (!Number.isFinite(Number(d.cellFt)) || Number(d.cellFt) <= 0) d.cellFt = 5;
    if (!Number.isFinite(Number(d.torchFt))) d.torchFt = 15;
    if (!Number.isFinite(Number(d.darkvisionFt))) d.darkvisionFt = 60;
    if (d.screen == null) d.screen = false;
    if (!d.underlay || typeof d.underlay !== "object") {
      d.underlay = { master: MASTER_MAP, clean: CLEAN_MAP, show: "master", alpha: 0.92 };
    }
    if (!d.underlay.master) d.underlay.master = MASTER_MAP;
    if (!d.underlay.clean) d.underlay.clean = CLEAN_MAP;
    if (!d.underlay.show) d.underlay.show = "master";
    if (!Number.isFinite(Number(d.underlay.alpha))) d.underlay.alpha = 0.92;
    if (Number(d.underlay.alpha) < 0.4) d.underlay.alpha = 0.92;
    if (!Array.isArray(d.levels) || !d.levels.length) {
      const cells = blankCells(DEFAULT_W, DEFAULT_H, CELL.VOID);
      const start = seedStart(cells);
      d.levels = [{ id: "main", name: "Укрытие Редбрандов", z: 0, w: DEFAULT_W, h: DEFAULT_H, cells: cells }];
      d.party = { x: start.x, y: start.y, z: 0, dir: 0, torch: true, darkvision: false };
    }
    const level = d.levels[0];
    if (!level.w) level.w = (level.cells && level.cells[0] && level.cells[0].length) || DEFAULT_W;
    if (!level.h) level.h = (level.cells && level.cells.length) || DEFAULT_H;
    if (!level.cells || !level.cells.length) level.cells = blankCells(level.w, level.h, CELL.VOID);
    if (!d.party || typeof d.party !== "object") {
      d.party = { x: 1, y: 1, z: 0, dir: 0, torch: true, darkvision: false };
    }
    d.party.x = Math.max(0, Math.min(level.w - 1, Math.round(Number(d.party.x) || 0)));
    d.party.y = Math.max(0, Math.min(level.h - 1, Math.round(Number(d.party.y) || 0)));
    d.party.dir = ((Math.round(Number(d.party.dir) || 0) % 4) + 4) % 4;
    if (d.party.torch == null) d.party.torch = true;
    if (d.party.darkvision == null) d.party.darkvision = false;
    d.props = Array.isArray(d.props) ? d.props : [];
    d.foes = Array.isArray(d.foes) ? d.foes : [];
    if (!d.explored || typeof d.explored !== "object") d.explored = {};
    markExplored(d);
    return d;
  }

  function levelOf(d) {
    return (d.levels || [])[0] || { w: DEFAULT_W, h: DEFAULT_H, cells: blankCells(DEFAULT_W, DEFAULT_H) };
  }

  function cellAt(level, x, y) {
    if (!level || y < 0 || x < 0 || y >= level.h || x >= level.w) return CELL.WALL;
    const row = level.cells[y];
    return row ? (row[x] | 0) : CELL.WALL;
  }

  function walkable(kind, secretsOpen) {
    if (kind === CELL.FLOOR || kind === CELL.DOOR || kind === CELL.BRIDGE) return true;
    if (kind === CELL.SECRET && secretsOpen) return true;
    return false;
  }

  function blocksLos(kind, secretsOpen) {
    if (kind === CELL.WALL) return true;
    if (kind === CELL.SECRET && !secretsOpen) return true;
    if (kind === CELL.DOOR) return true;
    return false;
  }

  function visionRange(d) {
    const party = d.party || {};
    if (party.darkvision) return Math.max(1, Math.round(Number(d.darkvisionFt) || 60) / (Number(d.cellFt) || 5));
    if (party.torch === false) return 0.5;
    return Math.max(0.5, Math.round(Number(d.torchFt) || 15) / (Number(d.cellFt) || 5));
  }

  function keyOf(x, y, z) {
    return String(z || 0) + ":" + x + ":" + y;
  }

  function markExplored(d) {
    const level = levelOf(d);
    const party = d.party;
    const range = Math.ceil(visionRange(d));
    const z = party.z || 0;
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        if (dx * dx + dy * dy > (range + 0.2) * (range + 0.2)) continue;
        const x = party.x + dx;
        const y = party.y + dy;
        if (x < 0 || y < 0 || x >= level.w || y >= level.h) continue;
        if (!hasLos(level, party.x, party.y, x, y, d)) continue;
        d.explored[keyOf(x, y, z)] = true;
      }
    }
  }

  function hasLos(level, x0, y0, x1, y1, d) {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      if (x === x1 && y === y1) return true;
      if (!(x === x0 && y === y0)) {
        const kind = cellAt(level, x, y);
        const secretOpen = (d.props || []).some(function (p) {
          return p && p.kind === "secretDoor" && p.x === x && p.y === y && p.revealed;
        }) || kind !== CELL.SECRET;
        if (kind === CELL.SECRET) {
          const open = (d.props || []).some(function (p) {
            return p && p.x === x && p.y === y && p.revealed;
          });
          if (!open && blocksLos(CELL.SECRET, false)) return false;
        } else if (blocksLos(kind, false) && !(kind === CELL.DOOR)) {
          return false;
        } else if (kind === CELL.DOOR) {
          /* door blocks until adjacent end */
          if (!(x === x1 && y === y1)) return false;
        }
      }
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  function secretOpenAt(d, x, y) {
    return (d.props || []).some(function (p) {
      return p && p.kind === "secretDoor" && p.x === x && p.y === y && p.revealed;
    });
  }

  function effectiveCell(d, level, x, y) {
    const kind = cellAt(level, x, y);
    if (kind === CELL.SECRET && secretOpenAt(d, x, y)) return CELL.FLOOR;
    return kind;
  }

  function project(campaign) {
    const d = ensure(campaign);
    const level = levelOf(d);
    return {
      kind: "dungeon",
      title: d.title || "Данж",
      cellFt: d.cellFt,
      torchFt: d.torchFt,
      darkvisionFt: d.darkvisionFt,
      party: {
        x: d.party.x,
        y: d.party.y,
        z: d.party.z || 0,
        dir: d.party.dir,
        torch: !!d.party.torch,
        darkvision: !!d.party.darkvision
      },
      level: {
        w: level.w,
        h: level.h,
        cells: level.cells
      },
      props: (d.props || []).map(function (p) {
        return {
          id: p.id,
          x: p.x,
          y: p.y,
          kind: p.kind,
          name: p.name || "",
          revealed: !!p.revealed,
          secret: !!p.secret
        };
      }),
      foes: (d.foes || []).map(function (f) {
        const actor = ((campaign.battle && campaign.battle.actors) || []).find(function (a) {
          return a && a.id === f.actorId;
        });
        return {
          id: f.id,
          x: f.x,
          y: f.y,
          actorId: f.actorId || "",
          name: (actor && actor.name) || f.name || "Враг",
          portrait: (actor && actor.portrait) || f.portrait || "",
          dead: !!(actor && actor.dead)
        };
      }),
      explored: d.explored || {},
      flash: d.flash || null,
      battle: projectInit(campaign)
    };
  }

  function projectInit(campaign) {
    const battle = campaign.battle;
    if (!battle || !Array.isArray(battle.actors)) return null;
    const actors = battle.actors.filter(function (a) { return a && String(a.name || "").trim(); });
    if (!actors.length) return null;
    const turn = Math.max(0, Math.round(Number(battle.turn) || 0));
    return {
      round: Math.max(1, Math.round(Number(battle.round) || 1)),
      turn: turn,
      actors: actors.map(function (actor, index) {
        return {
          id: actor.id,
          name: actor.name || "—",
          side: actor.side === "player" ? "player" : "foe",
          portrait: actor.portrait || "",
          dead: !!actor.dead,
          active: index === turn
        };
      })
    };
  }

  function playerHtml(page) {
    return '<div class="stage play-dungeon" data-dungeon-stage>' +
      '<canvas class="dung-fp" width="960" height="540" aria-label="Данж"></canvas>' +
      '<div class="dung-hud">' +
      '<canvas class="dung-mini" width="200" height="200" aria-label="Миникарта"></canvas>' +
      '<div class="dung-meta"><b>' + esc(page.title || "Данж") + "</b>" +
      '<span>Факел ' + esc(page.torchFt || 15) + "фт</span></div>" +
      "</div>" +
      (page.battle ? initStripHtml(page.battle, false) : "") +
      '<div class="dung-flash" hidden></div></div>';
  }

  function initStripHtml(battle, clickable) {
    if (!battle || !(battle.actors || []).length) return "";
    const tokens = battle.actors.map(function (actor) {
      const face = actor.portrait
        ? '<img alt="" src="' + esc(actor.portrait) + '">'
        : "<span>" + esc((actor.name || "?").slice(0, 1)) + "</span>";
      const cls = "dung-tok " + (actor.side === "player" ? "is-player" : "is-foe") +
        (actor.active ? " is-on" : "") + (actor.dead ? " is-dead" : "");
      const tag = clickable
        ? '<button type="button" class="' + cls + '" data-dung-turn="' + esc(actor.id) + '">' + face + "<em>" + esc(actor.name) + "</em></button>"
        : '<div class="' + cls + '">' + face + "<em>" + esc(actor.name) + "</em></div>";
      return tag;
    }).join("");
    return '<div class="dung-init"><span class="dung-round">Раунд <b>' + esc(battle.round || 1) + "</b></span>" +
      '<div class="dung-track">' + tokens + "</div></div>";
  }

  function paintView(root, page, opts) {
    if (!root || !page || page.kind !== "dungeon") return;
    const fp = root.querySelector(".dung-fp");
    const mini = root.querySelector(".dung-mini");
    if (fp) renderFp(fp, page, opts);
    if (mini) renderMini(mini, page, opts);
    const flash = root.querySelector(".dung-flash");
    if (flash && page.flash) {
      flash.hidden = false;
      flash.textContent = page.flash.text || "Открыто!";
      setTimeout(function () { flash.hidden = true; }, 1800);
    }
  }

  function dist2(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function renderFp(canvas, page, opts) {
    const master = !!(opts && opts.master);
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const level = page.level;
    const party = page.party;
    const dir = DIRS[party.dir || 0];
    const camX = party.x + 0.5;
    const camY = party.y + 0.5;
    const range = master ? 40 : visionRange(page);
    ctx.fillStyle = "#050403";
    ctx.fillRect(0, 0, w, h);

    const fov = Math.PI / 3;
    const planeScale = Math.tan(fov / 2);
    const dirAngle = Math.atan2(dir.y, dir.x);
    /* remap: dir vector in our DIRS is grid; raycaster uses x right, y down */
    const rdx = dir.x;
    const rdy = dir.y;
    const planeX = -rdy * planeScale;
    const planeY = rdx * planeScale;

    for (let col = 0; col < w; col++) {
      const cam = 2 * col / w - 1;
      const rayDirX = rdx + planeX * cam;
      const rayDirY = rdy + planeY * cam;
      let mapX = Math.floor(camX);
      let mapY = Math.floor(camY);
      const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
      const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);
      let stepX = 0;
      let stepY = 0;
      let sideDistX = 0;
      let sideDistY = 0;
      if (rayDirX < 0) { stepX = -1; sideDistX = (camX - mapX) * deltaDistX; }
      else { stepX = 1; sideDistX = (mapX + 1 - camX) * deltaDistX; }
      if (rayDirY < 0) { stepY = -1; sideDistY = (camY - mapY) * deltaDistY; }
      else { stepY = 1; sideDistY = (mapY + 1 - camY) * deltaDistY; }
      let hit = 0;
      let side = 0;
      let kind = CELL.VOID;
      for (let i = 0; i < 48; i++) {
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 0;
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 1;
        }
        kind = effectiveCell(page, level, mapX, mapY);
        if (kind === CELL.WALL || kind === CELL.SECRET || kind === CELL.DOOR) {
          hit = 1;
          break;
        }
        if (kind === CELL.VOID || kind === CELL.CHASM) {
          /* keep going through void; soft stop far */
        }
      }
      let perp = 0;
      if (hit) {
        perp = side === 0
          ? (mapX - camX + (1 - stepX) / 2) / rayDirX
          : (mapY - camY + (1 - stepY) / 2) / rayDirY;
      } else {
        perp = 24;
      }
      if (perp < 0.05) perp = 0.05;
      const lineH = Math.floor(h / perp);
      const drawStart = Math.max(0, Math.floor(-lineH / 2 + h / 2));
      const drawEnd = Math.min(h - 1, Math.floor(lineH / 2 + h / 2));

      /* ceiling / floor */
      const ceilGrad = ctx.createLinearGradient(col, 0, col, h / 2);
      ceilGrad.addColorStop(0, "#1a1510");
      ceilGrad.addColorStop(1, "#0c0a08");
      ctx.fillStyle = ceilGrad;
      ctx.fillRect(col, 0, 1, h / 2);
      const floorGrad = ctx.createLinearGradient(col, h / 2, col, h);
      floorGrad.addColorStop(0, "#2a241c");
      floorGrad.addColorStop(1, "#12100c");
      ctx.fillStyle = floorGrad;
      ctx.fillRect(col, h / 2, 1, h / 2);

      if (hit && perp <= range + 0.5) {
        let shade = side ? 0.65 : 0.85;
        if (kind === CELL.DOOR) shade *= 0.9;
        if (kind === CELL.SECRET) shade *= master ? 0.55 : 0.85;
        const fog = Math.min(1, perp / Math.max(range, 0.5));
        shade *= 1 - fog * 0.92;
        const base = kind === CELL.DOOR ? [120, 90, 50] : (kind === CELL.SECRET && master ? [90, 70, 40] : [70, 62, 52]);
        const r = Math.round(base[0] * shade);
        const g = Math.round(base[1] * shade);
        const b = Math.round(base[2] * shade);
        ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
        ctx.fillRect(col, drawStart, 1, drawEnd - drawStart + 1);
        if (kind === CELL.DOOR) {
          ctx.fillStyle = "rgba(30,20,10," + (0.35 + fog * 0.4) + ")";
          ctx.fillRect(col, drawStart + (drawEnd - drawStart) * 0.15, 1, (drawEnd - drawStart) * 0.7);
        }
      } else if (!master) {
        ctx.fillStyle = "rgba(0,0,0," + Math.min(0.96, 0.55 + (perp / 20)) + ")";
        ctx.fillRect(col, 0, 1, h);
      }
    }

    /* sprites: foes + revealed props */
    const sprites = [];
    (page.foes || []).forEach(function (f) {
      if (!f || f.dead) return;
      const dist = dist2(camX, camY, f.x + 0.5, f.y + 0.5);
      if (!master && dist > range) return;
      if (!master && !hasLos(level, party.x, party.y, f.x, f.y, page)) return;
      sprites.push({ x: f.x + 0.5, y: f.y + 0.5, dist: dist, label: f.name || "Враг", foe: true, portrait: f.portrait });
    });
    (page.props || []).forEach(function (p) {
      if (!p) return;
      if (p.secret && !p.revealed && !master) return;
      if (!master && p.secret && !p.revealed) return;
      const dist = dist2(camX, camY, p.x + 0.5, p.y + 0.5);
      if (!master && dist > range) return;
      sprites.push({
        x: p.x + 0.5,
        y: p.y + 0.5,
        dist: dist,
        label: p.name || (p.kind === "secretDoor" ? "Секрет" : "Объект"),
        secret: !!p.secret && !p.revealed,
        revealed: !!p.revealed
      });
    });
    sprites.sort(function (a, b) { return b.dist - a.dist; });
    sprites.forEach(function (sp) {
      const relX = sp.x - camX;
      const relY = sp.y - camY;
      const inv = 1 / (planeX * rdy - rdx * planeY || 1e-6);
      const transformX = inv * (rdy * relX - rdx * relY);
      const transformY = inv * (-planeY * relX + planeX * relY);
      if (transformY <= 0.2) return;
      const spriteH = Math.abs(Math.floor(h / transformY * 0.7));
      const spriteW = spriteH;
      const screenX = Math.floor(w / 2 * (1 + transformX / transformY));
      const drawX = Math.floor(screenX - spriteW / 2);
      const drawY = Math.floor(h / 2 - spriteH / 2);
      const fog = Math.min(1, sp.dist / Math.max(range, 0.5));
      ctx.globalAlpha = master && sp.secret ? 0.55 : (1 - fog * 0.75);
      if (sp.foe) {
        ctx.fillStyle = "#6b2a22";
        ctx.fillRect(drawX, drawY, spriteW, spriteH);
        ctx.strokeStyle = "#e07a6a";
        ctx.strokeRect(drawX + 0.5, drawY + 0.5, spriteW - 1, spriteH - 1);
      } else {
        ctx.fillStyle = sp.secret ? "#c4a35a" : (sp.revealed ? "#8fce4a" : "#5a6a7a");
        ctx.beginPath();
        ctx.ellipse(screenX, drawY + spriteH * 0.55, spriteW * 0.28, spriteH * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (spriteH > 28) {
        ctx.fillStyle = "rgba(243,234,216," + (0.85 - fog * 0.5) + ")";
        ctx.font = "12px Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillText(sp.label, screenX, drawY - 4);
      }
    });

    if (!master) {
      const g = ctx.createRadialGradient(w / 2, h * 0.55, h * 0.08, w / 2, h * 0.55, h * 0.72);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.55, "rgba(0,0,0,0.15)");
      g.addColorStop(1, "rgba(0,0,0," + (page.party.torch || page.party.darkvision ? 0.72 : 0.94) + ")");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function renderMini(canvas, page, opts) {
    const master = !!(opts && opts.master);
    const ctx = canvas.getContext("2d");
    const level = page.level;
    const party = page.party;
    const tw = canvas.width;
    const th = canvas.height;
    const cell = Math.min(tw / level.w, th / level.h);
    const ox = (tw - level.w * cell) / 2;
    const oy = (th - level.h * cell) / 2;
    ctx.fillStyle = "#0a0806";
    ctx.fillRect(0, 0, tw, th);
    for (let y = 0; y < level.h; y++) {
      for (let x = 0; x < level.w; x++) {
        const seen = master || page.explored[keyOf(x, y, party.z || 0)];
        if (!seen) continue;
        const kind = effectiveCell(page, level, x, y);
        if (kind === CELL.VOID) continue;
        if (kind === CELL.WALL || (kind === CELL.SECRET && !secretOpenAt(page, x, y))) ctx.fillStyle = "#4a4338";
        else if (kind === CELL.DOOR) ctx.fillStyle = "#8a6a3a";
        else if (kind === CELL.CHASM) ctx.fillStyle = "#1a1210";
        else if (kind === CELL.BRIDGE) ctx.fillStyle = "#6a5230";
        else ctx.fillStyle = "#2e2a22";
        ctx.fillRect(ox + x * cell, oy + y * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    (page.foes || []).forEach(function (f) {
      if (!f || f.dead) return;
      const seen = master || page.explored[keyOf(f.x, f.y, party.z || 0)];
      if (!seen) return;
      if (!master) {
        const dist = dist2(party.x, party.y, f.x, f.y);
        if (dist > visionRange(page)) return;
      }
      ctx.fillStyle = "#e4533e";
      ctx.fillRect(ox + f.x * cell + cell * 0.2, oy + f.y * cell + cell * 0.2, cell * 0.6, cell * 0.6);
    });
    const px = ox + (party.x + 0.5) * cell;
    const py = oy + (party.y + 0.5) * cell;
    const dir = DIRS[party.dir || 0];
    ctx.fillStyle = "#e6c36a";
    ctx.beginPath();
    ctx.moveTo(px + dir.x * cell * 0.45, py + dir.y * cell * 0.45);
    ctx.lineTo(px - dir.x * cell * 0.3 - dir.y * cell * 0.28, py - dir.y * cell * 0.3 + dir.x * cell * 0.28);
    ctx.lineTo(px - dir.x * cell * 0.3 + dir.y * cell * 0.28, py - dir.y * cell * 0.3 - dir.x * cell * 0.28);
    ctx.closePath();
    ctx.fill();
  }

  /* effectiveCell for page projection shape */
  function effectiveCell(pageOrD, level, x, y) {
    const kind = cellAt(level, x, y);
    const props = pageOrD.props || [];
    if (kind === CELL.SECRET) {
      const open = props.some(function (p) {
        return p && p.kind === "secretDoor" && p.x === x && p.y === y && p.revealed;
      });
      if (open) return CELL.FLOOR;
    }
    return kind;
  }

  function visionRange(pageOrD) {
    const party = pageOrD.party || {};
    const cellFt = Number(pageOrD.cellFt) || 5;
    if (party.darkvision) return Math.max(1, (Number(pageOrD.darkvisionFt) || 60) / cellFt);
    if (party.torch === false) return 0.5;
    return Math.max(0.5, (Number(pageOrD.torchFt) || 15) / cellFt);
  }

  function hasLos(level, x0, y0, x1, y1, pageOrD) {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      if (x === x1 && y === y1) return true;
      if (!(x === x0 && y === y0)) {
        const kind = effectiveCell(pageOrD, level, x, y);
        if (kind === CELL.WALL || kind === CELL.SECRET) return false;
        if (kind === CELL.DOOR && !(x === x1 && y === y1)) return false;
      }
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  function secretOpenAt(pageOrD, x, y) {
    return (pageOrD.props || []).some(function (p) {
      return p && p.kind === "secretDoor" && p.x === x && p.y === y && p.revealed;
    });
  }

  function mount(host, ctx) {
    if (!host || !ctx || !ctx.campaign) return;
    const d = ensure(ctx.campaign);
    let tool = "floor";
    let paint = false;
    let viewMode = "edit"; /* edit | eyes */
    host.innerHTML =
      '<div class="dung-work">' +
      '<aside class="dung-side">' +
      '<div class="dung-side-head"><h2>Данж</h2>' +
      '<label class="check" title="Показывать игрокам">Экран<input type="checkbox" data-dung="screen"' + (d.screen ? " checked" : "") + "></label></div>" +
      '<p class="note">' + esc(d.title) + " · 1кл = " + esc(d.cellFt) + "фт</p>" +
      '<div class="dung-under-box">' +
      '<label>Подложка карты<select data-dung="underlay">' +
      '<option value="master">Мастер (с секретами)</option>' +
      '<option value="clean">Чистая</option>' +
      '<option value="off">Без картинки</option></select></label>' +
      '<label>Яркость подложки<input data-dung="alpha" type="range" min="30" max="100" value="' + Math.round((d.underlay.alpha || 0.92) * 100) + '"></label>' +
      '<p class="note">Карта рисуется под сеткой. Обводи стены кистью «Стена».</p>' +
      "</div>" +
      '<div class="dung-tools">' +
      '<button type="button" data-tool="floor" class="is-on">Пол</button>' +
      '<button type="button" data-tool="wall">Стена</button>' +
      '<button type="button" data-tool="door">Дверь</button>' +
      '<button type="button" data-tool="secret">Секрет</button>' +
      '<button type="button" data-tool="chasm">Пропасть</button>' +
      '<button type="button" data-tool="bridge">Мост</button>' +
      '<button type="button" data-tool="erase">Стереть</button>' +
      '<button type="button" data-tool="party">Партия</button>' +
      '<button type="button" data-tool="foe">Враг</button>' +
      '<button type="button" data-tool="secretProp">Рычаг</button>' +
      "</div>" +
      '<div class="row dung-view-toggle">' +
      '<button type="button" data-dung-view="edit" class="is-on">Редактор</button>' +
      '<button type="button" data-dung-view="eyes">Глаза игрока</button>' +
      "</div>" +
      '<label>Факел,фт<input data-dung="torch" type="number" min="5" max="120" value="' + esc(d.torchFt) + '"></label>' +
      '<label class="check">Факел у партии<input type="checkbox" data-dung="partyTorch"' + (d.party.torch ? " checked" : "") + "></label>" +
      '<label class="check">Тёмное зрение<input type="checkbox" data-dung="darkvision"' + (d.party.darkvision ? " checked" : "") + "></label>" +
      '<div class="dung-move">' +
      '<button type="button" data-move="left" title="Влево">⟲</button>' +
      '<button type="button" data-move="forward" title="Вперёд">↑</button>' +
      '<button type="button" data-move="right" title="Вправо">⟳</button>' +
      '<button type="button" data-move="back" title="Назад">↓</button>' +
      "</div>" +
      '<div class="dung-init-host"></div>' +
      '<div class="dung-secret-box" hidden>' +
      '<p class="hero-label">Секрет</p>' +
      '<label>Имя<input data-secret-name type="text"></label>' +
      '<label>DC<input data-secret-dc type="number" min="1" max="30" value="15"></label>' +
      '<button type="button" class="primary" data-secret-check>Проверка</button>' +
      '<button type="button" data-secret-reveal>Открыть</button>' +
      "</div>" +
      '<p class="note">WASD / стрелки — ход. Клик по сетке — кисть. Секрет на стене = скрытая дверь.</p>' +
      '</aside>' +
      '<div class="dung-main">' +
      '<div class="dung-edit-wrap">' +
      '<canvas class="dung-grid" width="840" height="1040"></canvas>' +
      "</div>" +
      '<div class="dung-eyes" hidden>' +
      '<canvas class="dung-fp" width="960" height="540"></canvas>' +
      '<canvas class="dung-mini" width="220" height="220"></canvas>' +
      "</div></div></div>";

    const grid = host.querySelector(".dung-grid");
    const eyes = host.querySelector(".dung-eyes");
    const editWrap = host.querySelector(".dung-edit-wrap");
    const secretBox = host.querySelector(".dung-secret-box");
    let selectedProp = null;
    const underImg = new Image();
    underImg.decoding = "async";
    underImg.onload = function () { paintGrid(); };
    underImg.onerror = function () {
      const note = host.querySelector(".dung-under-box .note");
      if (note) note.textContent = "Карта не загрузилась: " + (underImg.dataset.url || "");
    };

    function saveSoon() {
      markExplored(d);
      if (ctx.save) ctx.save();
    }

    function syncUnder() {
      const show = d.underlay.show || "master";
      if (show === "off") {
        underImg.dataset.url = "";
        underImg.removeAttribute("src");
        return;
      }
      const url = show === "clean" ? (d.underlay.clean || CLEAN_MAP) : (d.underlay.master || MASTER_MAP);
      if (underImg.dataset.url !== url) {
        underImg.dataset.url = url;
        underImg.src = url;
      }
    }

    function paintGrid() {
      const level = levelOf(d);
      const ctx2 = grid.getContext("2d");
      const cell = Math.min(grid.width / level.w, grid.height / level.h);
      const ox = (grid.width - level.w * cell) / 2;
      const oy = (grid.height - level.h * cell) / 2;
      ctx2.clearRect(0, 0, grid.width, grid.height);
      ctx2.fillStyle = "#15120e";
      ctx2.fillRect(0, 0, grid.width, grid.height);
      if (d.underlay.show !== "off" && underImg.complete && underImg.naturalWidth) {
        ctx2.save();
        ctx2.globalAlpha = Math.max(0.3, Math.min(1, Number(d.underlay.alpha) || 0.92));
        ctx2.drawImage(underImg, ox, oy, level.w * cell, level.h * cell);
        ctx2.restore();
      } else if (d.underlay.show !== "off") {
        ctx2.fillStyle = "#c4a35a";
        ctx2.font = "16px Georgia, serif";
        ctx2.textAlign = "center";
        ctx2.fillText("Загрузка карты…", grid.width / 2, grid.height / 2);
      }
      for (let y = 0; y < level.h; y++) {
        for (let x = 0; x < level.w; x++) {
          const kind = cellAt(level, x, y);
          if (kind === CELL.VOID) continue;
          const colors = {
            1: "rgba(80,70,55,0.28)",
            2: "rgba(20,18,14,0.72)",
            3: "rgba(140,100,40,0.55)",
            4: "rgba(180,140,50,0.6)",
            5: "rgba(10,8,12,0.65)",
            6: "rgba(110,80,40,0.5)"
          };
          ctx2.fillStyle = colors[kind] || "rgba(60,60,60,0.4)";
          ctx2.fillRect(ox + x * cell, oy + y * cell, cell + 0.5, cell + 0.5);
        }
      }
      ctx2.strokeStyle = "rgba(230,195,106,0.12)";
      ctx2.lineWidth = 1;
      for (let x = 0; x <= level.w; x++) {
        ctx2.beginPath();
        ctx2.moveTo(ox + x * cell, oy);
        ctx2.lineTo(ox + x * cell, oy + level.h * cell);
        ctx2.stroke();
      }
      for (let y = 0; y <= level.h; y++) {
        ctx2.beginPath();
        ctx2.moveTo(ox, oy + y * cell);
        ctx2.lineTo(ox + level.w * cell, oy + y * cell);
        ctx2.stroke();
      }
      (d.props || []).forEach(function (p) {
        ctx2.fillStyle = p.revealed ? "#8fce4a" : "#e6c36a";
        ctx2.beginPath();
        ctx2.arc(ox + (p.x + 0.5) * cell, oy + (p.y + 0.5) * cell, cell * 0.28, 0, Math.PI * 2);
        ctx2.fill();
        if (selectedProp && selectedProp.id === p.id) {
          ctx2.strokeStyle = "#fff";
          ctx2.stroke();
        }
      });
      (d.foes || []).forEach(function (f) {
        ctx2.fillStyle = "#e4533e";
        ctx2.fillRect(ox + f.x * cell + cell * 0.2, oy + f.y * cell + cell * 0.2, cell * 0.6, cell * 0.6);
      });
      const dir = DIRS[d.party.dir || 0];
      const px = ox + (d.party.x + 0.5) * cell;
      const py = oy + (d.party.y + 0.5) * cell;
      ctx2.fillStyle = "#e6c36a";
      ctx2.beginPath();
      ctx2.moveTo(px + dir.x * cell * 0.4, py + dir.y * cell * 0.4);
      ctx2.lineTo(px - dir.x * cell * 0.28 - dir.y * cell * 0.25, py - dir.y * cell * 0.28 + dir.x * cell * 0.25);
      ctx2.lineTo(px - dir.x * cell * 0.28 + dir.y * cell * 0.25, py - dir.y * cell * 0.28 - dir.x * cell * 0.25);
      ctx2.closePath();
      ctx2.fill();
      grid._cell = cell;
      grid._ox = ox;
      grid._oy = oy;
    }

    function paintEyes() {
      const page = project(ctx.campaign);
      paintView(eyes, page, { master: true });
    }

    function paintInit() {
      const box = host.querySelector(".dung-init-host");
      const battle = projectInit(ctx.campaign);
      box.innerHTML = battle
        ? initStripHtml(battle, true) + '<div class="row"><button type="button" data-dung-next>След. ход</button></div>'
        : '<p class="note">Нет актёров в бое. Поставьте врага или героя в модуле Бой.</p>';
    }

    function refresh() {
      syncUnder();
      paintGrid();
      paintEyes();
      paintInit();
      secretBox.hidden = !selectedProp;
      if (selectedProp) {
        host.querySelector("[data-secret-name]").value = selectedProp.name || "";
        host.querySelector("[data-secret-dc]").value = String(selectedProp.dc || 15);
      }
    }

    function cellFromEvent(event) {
      const rect = grid.getBoundingClientRect();
      const scaleX = grid.width / rect.width;
      const scaleY = grid.height / rect.height;
      const mx = (event.clientX - rect.left) * scaleX;
      const my = (event.clientY - rect.top) * scaleY;
      const x = Math.floor((mx - grid._ox) / grid._cell);
      const y = Math.floor((my - grid._oy) / grid._cell);
      const level = levelOf(d);
      if (x < 0 || y < 0 || x >= level.w || y >= level.h) return null;
      return { x: x, y: y };
    }

    function applyBrush(at) {
      if (!at) return;
      const level = levelOf(d);
      if (tool === "party") {
        d.party.x = at.x;
        d.party.y = at.y;
        markExplored(d);
        refresh();
        saveSoon();
        return;
      }
      if (tool === "foe") {
        const battle = window.ShirmoBattle ? window.ShirmoBattle.ensure(ctx.campaign) : null;
        let actor = null;
        if (battle) {
          actor = {
            id: crypto.randomUUID(),
            name: "Враг",
            side: "foe",
            hp: 11,
            hpMax: 11,
            ac: 13,
            init: 10,
            initBonus: 1,
            dead: false,
            weapon: "Скимитар",
            damage: "1d6+1",
            bonus: 3,
            portrait: "",
            marks: [],
            note: "Данж"
          };
          battle.actors.push(actor);
          window.ShirmoBattle.ensure(ctx.campaign);
        }
        d.foes.push({
          id: crypto.randomUUID(),
          x: at.x,
          y: at.y,
          z: 0,
          actorId: actor ? actor.id : "",
          name: "Враг"
        });
        refresh();
        saveSoon();
        return;
      }
      if (tool === "secretProp") {
        const prop = {
          id: crypto.randomUUID(),
          x: at.x,
          y: at.y,
          z: 0,
          kind: "lever",
          name: "Скрытый рычаг",
          secret: true,
          revealed: false,
          dc: 15,
          skill: "Внимание"
        };
        d.props.push(prop);
        selectedProp = prop;
        refresh();
        saveSoon();
        return;
      }
      const map = {
        floor: CELL.FLOOR,
        wall: CELL.WALL,
        door: CELL.DOOR,
        secret: CELL.SECRET,
        chasm: CELL.CHASM,
        bridge: CELL.BRIDGE,
        erase: CELL.VOID
      };
      const next = map[tool];
      if (next == null) return;
      level.cells[at.y][at.x] = next;
      if (tool === "secret") {
        const exists = d.props.some(function (p) { return p.kind === "secretDoor" && p.x === at.x && p.y === at.y; });
        if (!exists) {
          d.props.push({
            id: crypto.randomUUID(),
            x: at.x,
            y: at.y,
            z: 0,
            kind: "secretDoor",
            name: "Секретная дверь",
            secret: true,
            revealed: false,
            dc: 15,
            skill: "Внимание"
          });
        }
      }
      paintGrid();
      saveSoon();
    }

    function tryMove(step, turn) {
      if (turn) d.party.dir = ((d.party.dir + turn) % 4 + 4) % 4;
      if (step) {
        const dir = DIRS[d.party.dir];
        const nx = d.party.x + dir.x * step;
        const ny = d.party.y + dir.y * step;
        const level = levelOf(d);
        const kind = effectiveCell(d, level, nx, ny);
        if (walkable(kind, false)) {
          d.party.x = nx;
          d.party.y = ny;
        }
      }
      markExplored(d);
      refresh();
      saveSoon();
    }

    function setView(mode) {
      viewMode = mode;
      host.querySelectorAll("[data-dung-view]").forEach(function (btn) {
        btn.classList.toggle("is-on", btn.getAttribute("data-dung-view") === mode);
      });
      editWrap.hidden = mode !== "edit";
      eyes.hidden = mode !== "eyes";
      if (mode === "eyes") paintEyes();
    }

    host.querySelectorAll("[data-tool]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        tool = btn.getAttribute("data-tool");
        host.querySelectorAll("[data-tool]").forEach(function (node) {
          node.classList.toggle("is-on", node === btn);
        });
      });
    });
    host.querySelectorAll("[data-dung-view]").forEach(function (btn) {
      btn.addEventListener("click", function () { setView(btn.getAttribute("data-dung-view")); });
    });
    host.querySelector("[data-dung=underlay]").value = d.underlay.show || "master";
    host.querySelector("[data-dung=underlay]").addEventListener("change", function () {
      d.underlay.show = this.value;
      syncUnder();
      paintGrid();
      saveSoon();
    });
    host.querySelector("[data-dung=alpha]").addEventListener("input", function () {
      d.underlay.alpha = Math.max(0.3, Math.min(1, Number(this.value) / 100));
      paintGrid();
      saveSoon();
    });
    host.querySelector("[data-dung=torch]").addEventListener("change", function () {
      d.torchFt = Math.max(5, Math.min(120, Math.round(Number(this.value) || 15)));
      refresh();
      saveSoon();
    });
    host.querySelector("[data-dung=screen]").addEventListener("change", function () {
      d.screen = !!this.checked;
      if (d.screen && ctx.campaign.battle) ctx.campaign.battle.screen = false;
      saveSoon();
    });
    host.querySelector("[data-dung=partyTorch]").addEventListener("change", function () {
      d.party.torch = !!this.checked;
      refresh();
      saveSoon();
    });
    host.querySelector("[data-dung=darkvision]").addEventListener("change", function () {
      d.party.darkvision = !!this.checked;
      refresh();
      saveSoon();
    });
    host.querySelectorAll("[data-move]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const m = btn.getAttribute("data-move");
        if (m === "left") tryMove(0, -1);
        if (m === "right") tryMove(0, 1);
        if (m === "forward") tryMove(1, 0);
        if (m === "back") tryMove(-1, 0);
      });
    });

    grid.addEventListener("mousedown", function (event) {
      if (viewMode !== "edit") return;
      paint = true;
      const at = cellFromEvent(event);
      if (tool === "secretProp" || tool === "foe" || tool === "party") applyBrush(at);
      else {
        /* select prop if click on one */
        const hit = (d.props || []).find(function (p) { return at && p.x === at.x && p.y === at.y; });
        if (hit && tool !== "erase" && event.shiftKey) {
          selectedProp = hit;
          refresh();
          return;
        }
        applyBrush(at);
      }
    });
    grid.addEventListener("mousemove", function (event) {
      if (!paint || viewMode !== "edit") return;
      if (tool === "foe" || tool === "secretProp" || tool === "party") return;
      applyBrush(cellFromEvent(event));
    });
    window.addEventListener("mouseup", function () { paint = false; });

    host.addEventListener("click", function (event) {
      const next = event.target.closest("[data-dung-next]");
      if (next) {
        const battle = window.ShirmoBattle ? window.ShirmoBattle.ensure(ctx.campaign) : ctx.campaign.battle;
        if (!battle || !(battle.actors || []).length) return;
        let turn = Math.round(Number(battle.turn) || 0) + 1;
        if (turn >= battle.actors.length) {
          turn = 0;
          battle.round = Math.max(1, Math.round(Number(battle.round) || 1) + 1);
        }
        battle.turn = turn;
        refresh();
        saveSoon();
        return;
      }
      const tok = event.target.closest("[data-dung-turn]");
      if (tok) {
        const battle = ctx.campaign.battle;
        if (!battle) return;
        const id = tok.getAttribute("data-dung-turn");
        const index = (battle.actors || []).findIndex(function (a) { return a && a.id === id; });
        if (index >= 0) battle.turn = index;
        refresh();
        saveSoon();
      }
    });

    host.querySelector("[data-secret-check]").addEventListener("click", function () {
      if (!selectedProp) return;
      selectedProp.name = host.querySelector("[data-secret-name]").value || selectedProp.name;
      selectedProp.dc = Math.round(Number(host.querySelector("[data-secret-dc]").value) || 15);
      const dc = selectedProp.dc;
      if (ctx.roll) {
        ctx.roll({
          name: (selectedProp.skill || "Проверка") + " (DC " + dc + ")",
          count: 1,
          sides: 20,
          bonus: 0,
          mode: "normal"
        }).then(function (data) {
          const roll = (data && data.event && data.event.roll) || data;
          const total = roll && roll.total;
          if (Number(total) >= dc) revealProp(selectedProp);
          else window.alert("Проверка " + total + " против DC " + dc + " — мимо.");
          refresh();
          saveSoon();
        }).catch(function () { /* ignore */ });
      } else if (window.confirm("Успех проверки DC " + dc + "?")) {
        revealProp(selectedProp);
        refresh();
        saveSoon();
      }
    });
    host.querySelector("[data-secret-reveal]").addEventListener("click", function () {
      if (!selectedProp) return;
      selectedProp.name = host.querySelector("[data-secret-name]").value || selectedProp.name;
      revealProp(selectedProp);
      refresh();
      saveSoon();
    });
    host.querySelector("[data-secret-name]").addEventListener("change", function () {
      if (!selectedProp) return;
      selectedProp.name = this.value;
      saveSoon();
    });

    function revealProp(prop) {
      if (!prop) return;
      prop.revealed = true;
      if (prop.kind === "secretDoor") {
        const level = levelOf(d);
        if (cellAt(level, prop.x, prop.y) === CELL.SECRET) {
          level.cells[prop.y][prop.x] = CELL.DOOR;
        }
      }
      d.flash = { text: (prop.name || "Секрет") + "!", at: Date.now() };
      setTimeout(function () {
        if (d.flash && d.flash.at && Date.now() - d.flash.at > 1500) d.flash = null;
        saveSoon();
      }, 2000);
    }

    function onKey(event) {
      if (host.hidden) return;
      const tag = event.target && event.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") { event.preventDefault(); tryMove(1, 0); }
      if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") { event.preventDefault(); tryMove(-1, 0); }
      if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") { event.preventDefault(); tryMove(0, -1); }
      if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") { event.preventDefault(); tryMove(0, 1); }
      if (event.key === "q" || event.key === "Q") { event.preventDefault(); tryMove(0, -1); }
      if (event.key === "e" || event.key === "E") { event.preventDefault(); tryMove(0, 1); }
    }
    document.addEventListener("keydown", onKey);
    host._dungKill = function () { document.removeEventListener("keydown", onKey); };
    host._refresh = refresh;

    syncUnder();
    refresh();
    setView("edit");
  }

  return {
    ensure: ensure,
    mount: mount,
    project: project,
    playerHtml: playerHtml,
    paintView: paintView,
    CELL: CELL
  };
})();
