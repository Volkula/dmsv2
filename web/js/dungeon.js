window.ShirmoDungeon = (function () {
  const CELL = { VOID: 0, FLOOR: 1, WALL: 2, DOOR: 3, SECRET: 4, CHASM: 5, BRIDGE: 6, STAIR_UP: 7, STAIR_DOWN: 8 };
  const DIRS = [
    { x: 0, y: -1, name: "С" },
    { x: 1, y: 0, name: "В" },
    { x: 0, y: 1, name: "Ю" },
    { x: -1, y: 0, name: "З" }
  ];
  const NEIGH = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const DEFAULT_W = 48;
  const DEFAULT_H = 56;
  const TEX = 64;
  const DOOR_TYPES = [
    { id: "wood", name: "Дерево" },
    { id: "iron", name: "Железо" },
    { id: "locked", name: "Замок" },
    { id: "bars", name: "Решётка" }
  ];

  const PROP_KINDS = [
    { id: "lever", name: "Рычаг", secret: true, dc: 15 },
    { id: "chest", name: "Сундук", secret: false, dc: 12 },
    { id: "torch", name: "Факел", secret: false, light: 20 },
    { id: "trap", name: "Ловушка", secret: true, dc: 14 },
    { id: "note", name: "Записка", secret: false, dc: 10 },
    { id: "altar", name: "Алтарь", secret: false, dc: 0 },
    { id: "secretDoor", name: "Секрет", secret: true, dc: 15 }
  ];

  const TOOL_GROUPS = [
    {
      id: "terrain",
      label: "Клетки",
      tools: [
        { id: "floor", label: "Пол", cell: CELL.FLOOR, icon: "floor" },
        { id: "wall", label: "Стена", cell: CELL.WALL, icon: "wall" },
        { id: "erase", label: "Стереть", cell: CELL.VOID, icon: "erase" },
        { id: "chasm", label: "Яма", cell: CELL.CHASM, icon: "chasm" },
        { id: "bridge", label: "Мост", cell: CELL.BRIDGE, icon: "bridge" }
      ]
    },
    {
      id: "doors",
      label: "Двери",
      tools: [
        { id: "door", label: "Дверь", cell: CELL.DOOR, icon: "door" },
        { id: "secret", label: "Тайная", cell: CELL.SECRET, icon: "secret" },
        { id: "stair_up", label: "Вверх", cell: CELL.STAIR_UP, icon: "up" },
        { id: "stair_down", label: "Вниз", cell: CELL.STAIR_DOWN, icon: "down" }
      ]
    },
    {
      id: "actors",
      label: "Фигуры",
      tools: [
        { id: "party", label: "Партия", cell: null, icon: "party" },
        { id: "foe", label: "Враг", cell: null, icon: "foe" },
        { id: "prop", label: "Объект", cell: null, icon: "prop" }
      ]
    }
  ];
  const TOOLS = TOOL_GROUPS.reduce(function (list, group) { return list.concat(group.tools); }, []);

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : ("id-" + Math.random().toString(16).slice(2));
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

  function seedRoom(cells) {
    const h = cells.length;
    const w = cells[0].length;
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h * 0.75);
    for (let y = cy - 3; y <= cy + 3; y++) {
      for (let x = cx - 3; x <= cx + 3; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const edge = y === cy - 3 || y === cy + 3 || x === cx - 3 || x === cx + 3;
        cells[y][x] = edge ? CELL.WALL : CELL.FLOOR;
      }
    }
    cells[cy - 3][cx] = CELL.DOOR;
    return { x: cx, y: cy };
  }

  /* ——— процедурные текстуры в стиле старого Doom ——— */
  function noise(x, y, seed) {
    const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function makeTex(paint) {
    const c = document.createElement("canvas");
    c.width = TEX;
    c.height = TEX;
    const g = c.getContext("2d");
    paint(g, TEX);
    return c;
  }

  function texStone(g, s) {
    g.fillStyle = "#3a342c";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const x = Math.floor(noise(i, 1, 3) * s);
      const y = Math.floor(noise(i, 2, 5) * s);
      const v = 40 + noise(i, 3, 7) * 50;
      g.fillStyle = "rgb(" + (v | 0) + "," + ((v * 0.9) | 0) + "," + ((v * 0.75) | 0) + ")";
      g.fillRect(x, y, 1 + (noise(i, 4, 1) * 2 | 0), 1);
    }
    g.strokeStyle = "rgba(0,0,0,0.35)";
    for (let row = 0; row < 4; row++) {
      const yy = row * 16 + 8;
      g.beginPath();
      g.moveTo(0, yy);
      g.lineTo(s, yy);
      g.stroke();
      const off = row % 2 ? 16 : 0;
      for (let col = 0; col < 4; col++) {
        g.beginPath();
        g.moveTo(col * 32 + off, yy - 8);
        g.lineTo(col * 32 + off, yy + 8);
        g.stroke();
      }
    }
    g.fillStyle = "rgba(255,220,160,0.04)";
    g.fillRect(0, 0, s, s / 3);
  }

  function texBrick(g, s) {
    g.fillStyle = "#4a2e24";
    g.fillRect(0, 0, s, s);
    const bh = 10;
    const bw = 20;
    for (let y = 0; y < s; y += bh) {
      const shift = ((y / bh) | 0) % 2 ? bw / 2 : 0;
      for (let x = -bw; x < s + bw; x += bw) {
        const shade = 90 + noise(x, y, 9) * 40;
        g.fillStyle = "rgb(" + (shade | 0) + "," + ((shade * 0.55) | 0) + "," + ((shade * 0.4) | 0) + ")";
        g.fillRect(x + shift + 1, y + 1, bw - 2, bh - 2);
      }
    }
    g.strokeStyle = "rgba(20,10,8,0.6)";
    g.lineWidth = 1;
    for (let y = 0; y <= s; y += bh) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
    }
  }

  function texWood(g, s) {
    g.fillStyle = "#5a3a1e";
    g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x++) {
      const v = 70 + noise(x, 0, 2) * 40 + Math.sin(x * 0.4) * 8;
      g.fillStyle = "rgb(" + (v | 0) + "," + ((v * 0.65) | 0) + "," + ((v * 0.35) | 0) + ")";
      g.fillRect(x, 0, 1, s);
    }
    g.strokeStyle = "rgba(0,0,0,0.35)";
    for (let y = 16; y < s; y += 16) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
    }
  }

  function texFloor(g, s) {
    g.fillStyle = "#2a241c";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 500; i++) {
      const x = noise(i, 8, 1) * s | 0;
      const y = noise(i, 9, 2) * s | 0;
      const v = 35 + noise(i, 10, 3) * 35;
      g.fillStyle = "rgb(" + (v | 0) + "," + ((v * 0.88) | 0) + "," + ((v * 0.7) | 0) + ")";
      g.fillRect(x, y, 2, 2);
    }
    g.strokeStyle = "rgba(0,0,0,0.25)";
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * 16); g.lineTo(s, i * 16); g.stroke();
    }
  }

  function texCeil(g, s) {
    g.fillStyle = "#1a1612";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 300; i++) {
      const x = noise(i, 11, 4) * s | 0;
      const y = noise(i, 12, 5) * s | 0;
      g.fillStyle = "rgba(0,0,0," + (0.15 + noise(i, 13, 6) * 0.4) + ")";
      g.fillRect(x, y, 3, 3);
    }
  }

  function texDoor(g, s) {
    texWood(g, s);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(s * 0.15, s * 0.1, s * 0.7, s * 0.8);
    g.fillStyle = "#c4a35a";
    g.beginPath();
    g.arc(s * 0.72, s * 0.5, 3, 0, Math.PI * 2);
    g.fill();
  }

  function texSecret(g, s) {
    texStone(g, s);
    g.strokeStyle = "rgba(230,195,106,0.35)";
    g.strokeRect(8, 8, s - 16, s - 16);
  }

  const TEX_SET = {
    wall: null,
    brick: null,
    wood: null,
    floor: null,
    ceil: null,
    door: null,
    secret: null
  };

  function textures() {
    if (!TEX_SET.wall) {
      TEX_SET.wall = makeTex(texStone);
      TEX_SET.brick = makeTex(texBrick);
      TEX_SET.wood = makeTex(texWood);
      TEX_SET.floor = makeTex(texFloor);
      TEX_SET.ceil = makeTex(texCeil);
      TEX_SET.door = makeTex(texDoor);
      TEX_SET.secret = makeTex(texSecret);
    }
    return TEX_SET;
  }

  function iconCanvas(kind, size) {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d");
    g.clearRect(0, 0, size, size);
    if (kind === "floor") {
      g.fillStyle = "#5a4a32";
      g.fillRect(4, 4, size - 8, size - 8);
      g.strokeStyle = "#e6c36a";
      g.strokeRect(4.5, 4.5, size - 9, size - 9);
      g.beginPath();
      g.moveTo(size / 2, 4); g.lineTo(size / 2, size - 4);
      g.moveTo(4, size / 2); g.lineTo(size - 4, size / 2);
      g.stroke();
    } else if (kind === "wall") {
      g.fillStyle = "#2a2620";
      g.fillRect(3, 3, size - 6, size - 6);
      g.strokeStyle = "#8a8070";
      g.strokeRect(6, 10, size - 12, 8);
      g.strokeRect(6, 20, size - 12, 8);
    } else if (kind === "erase") {
      g.strokeStyle = "#e07a6a";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(8, 8); g.lineTo(size - 8, size - 8);
      g.moveTo(size - 8, 8); g.lineTo(8, size - 8);
      g.stroke();
    } else if (kind === "chasm") {
      g.fillStyle = "#0a080c";
      g.beginPath();
      g.moveTo(6, 10); g.lineTo(size - 6, 8); g.lineTo(size - 8, size - 6); g.lineTo(8, size - 8);
      g.closePath();
      g.fill();
    } else if (kind === "bridge") {
      g.fillStyle = "#8a5a22";
      g.fillRect(4, size * 0.4, size - 8, size * 0.22);
      g.strokeStyle = "#3a2410";
      g.strokeRect(4.5, size * 0.4, size - 9, size * 0.22);
    } else if (kind === "door") {
      g.fillStyle = "#6a3a14";
      g.fillRect(size * 0.28, 6, size * 0.44, size - 12);
      g.fillStyle = "#c4a35a";
      g.beginPath();
      g.arc(size * 0.62, size * 0.5, 2.5, 0, Math.PI * 2);
      g.fill();
    } else if (kind === "secret") {
      g.fillStyle = "#3a342c";
      g.fillRect(6, 6, size - 12, size - 12);
      g.fillStyle = "#e6c36a";
      g.font = "bold " + Math.floor(size * 0.45) + "px Georgia";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("S", size / 2, size / 2 + 1);
    } else if (kind === "up" || kind === "down") {
      g.fillStyle = "#e6c36a";
      g.beginPath();
      if (kind === "up") {
        g.moveTo(size / 2, 6); g.lineTo(size - 6, size - 8); g.lineTo(6, size - 8);
      } else {
        g.moveTo(6, 8); g.lineTo(size - 6, 8); g.lineTo(size / 2, size - 6);
      }
      g.closePath();
      g.fill();
    } else if (kind === "prop") {
      g.fillStyle = "#5a6a7a";
      g.beginPath();
      g.arc(size / 2, size / 2, size * 0.28, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#e6c36a";
      g.stroke();
    } else if (kind === "lever") {
      g.fillStyle = "#6a5430";
      g.fillRect(size * 0.35, size * 0.55, size * 0.3, size * 0.35);
      g.strokeStyle = "#e6c36a";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(size * 0.5, size * 0.55);
      g.lineTo(size * 0.25, size * 0.2);
      g.stroke();
      g.fillStyle = "#e4533e";
      g.beginPath();
      g.arc(size * 0.25, size * 0.2, 4, 0, Math.PI * 2);
      g.fill();
    } else if (kind === "chest") {
      g.fillStyle = "#8a5a22";
      g.fillRect(size * 0.15, size * 0.35, size * 0.7, size * 0.45);
      g.fillStyle = "#c4a35a";
      g.fillRect(size * 0.45, size * 0.5, size * 0.1, size * 0.15);
      g.strokeStyle = "#3a2410";
      g.strokeRect(size * 0.15, size * 0.35, size * 0.7, size * 0.45);
    } else if (kind === "torch") {
      g.fillStyle = "#5a3a1e";
      g.fillRect(size * 0.45, size * 0.4, size * 0.1, size * 0.45);
      g.fillStyle = "#e6a020";
      g.beginPath();
      g.moveTo(size * 0.5, size * 0.15);
      g.lineTo(size * 0.35, size * 0.45);
      g.lineTo(size * 0.65, size * 0.45);
      g.closePath();
      g.fill();
    } else if (kind === "trap") {
      g.strokeStyle = "#e4533e";
      g.lineWidth = 2;
      g.strokeRect(size * 0.2, size * 0.2, size * 0.6, size * 0.6);
      g.beginPath();
      g.moveTo(size * 0.3, size * 0.3);
      g.lineTo(size * 0.7, size * 0.7);
      g.moveTo(size * 0.7, size * 0.3);
      g.lineTo(size * 0.3, size * 0.7);
      g.stroke();
    } else if (kind === "foe") {
      g.fillStyle = "#6b2a22";
      g.beginPath();
      g.arc(size * 0.5, size * 0.4, size * 0.22, 0, Math.PI * 2);
      g.fill();
      g.fillRect(size * 0.32, size * 0.55, size * 0.36, size * 0.3);
      g.fillStyle = "#e07a6a";
      g.fillRect(size * 0.4, size * 0.35, 3, 3);
      g.fillRect(size * 0.55, size * 0.35, 3, 3);
    } else if (kind === "party") {
      g.fillStyle = "#e6c36a";
      g.beginPath();
      g.moveTo(size * 0.5, size * 0.15);
      g.lineTo(size * 0.8, size * 0.8);
      g.lineTo(size * 0.2, size * 0.8);
      g.closePath();
      g.fill();
    } else if (kind === "secretDoor") {
      g.fillStyle = "#4a4338";
      g.fillRect(size * 0.2, size * 0.15, size * 0.6, size * 0.7);
      g.fillStyle = "#e6c36a";
      g.font = "bold " + Math.floor(size * 0.45) + "px Georgia";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("S", size * 0.5, size * 0.5);
    } else {
      g.fillStyle = "#5a6a7a";
      g.beginPath();
      g.arc(size * 0.5, size * 0.5, size * 0.28, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  }

  const ICON_CACHE = {};
  function iconOf(kind, size) {
    const key = kind + ":" + size;
    if (!ICON_CACHE[key]) ICON_CACHE[key] = iconCanvas(kind, size);
    return ICON_CACHE[key];
  }

  function makeLevel(name, w, h) {
    const cells = blankCells(w || DEFAULT_W, h || DEFAULT_H, CELL.VOID);
    const start = seedRoom(cells);
    return {
      id: uid(),
      name: name || "Этаж 1",
      w: w || DEFAULT_W,
      h: h || DEFAULT_H,
      cells: cells,
      doors: {},
      underlay: "",
      underScale: 1,
      underX: 0,
      underY: 0,
      start: start
    };
  }

  function makeSite(name) {
    const level = makeLevel("Этаж 1");
    return {
      id: uid(),
      name: name || "Убежище",
      levels: [level],
      activeLevelId: level.id,
      props: [],
      foes: [],
      explored: {},
      party: {
        x: level.start.x,
        y: level.start.y,
        levelId: level.id,
        dir: 0,
        torch: true,
        darkvision: false
      }
    };
  }

  function flushSite(d) {
    const site = activeSite(d);
    if (!site) return;
    site.levels = d.levels;
    site.activeLevelId = d.activeLevelId;
    site.props = d.props;
    site.foes = d.foes;
    site.explored = d.explored;
    site.party = d.party;
  }

  function loadSite(d, siteId) {
    flushSite(d);
    const site = (d.sites || []).find(function (s) { return s.id === siteId; });
    if (!site) return;
    d.activeSiteId = site.id;
    d.levels = site.levels;
    d.activeLevelId = site.activeLevelId;
    d.props = site.props;
    d.foes = site.foes;
    d.explored = site.explored;
    d.party = site.party;
    d.title = site.name;
  }

  function activeSite(d) {
    return (d.sites || []).find(function (s) { return s && s.id === d.activeSiteId; }) || (d.sites || [])[0] || null;
  }

  function normalizeLevel(level, i) {
    if (!level.id) level.id = uid();
    if (!level.name) level.name = "Этаж " + (i + 1);
    if (!level.w) level.w = (level.cells && level.cells[0] && level.cells[0].length) || DEFAULT_W;
    if (!level.h) level.h = (level.cells && level.cells.length) || DEFAULT_H;
    if (!level.cells || !level.cells.length) level.cells = blankCells(level.w, level.h, CELL.VOID);
    if (!level.doors || typeof level.doors !== "object") level.doors = {};
    if (level.underlay == null) level.underlay = "";
    if (String(level.underlay).indexOf("blob:") === 0) level.underlay = "";
    if (!Number.isFinite(Number(level.underScale)) || Number(level.underScale) <= 0) level.underScale = 1;
    if (!Number.isFinite(Number(level.underX))) level.underX = 0;
    if (!Number.isFinite(Number(level.underY))) level.underY = 0;
  }

  function ensure(campaign) {
    if (!campaign.dungeon || typeof campaign.dungeon !== "object") campaign.dungeon = {};
    const d = campaign.dungeon;
    if (!d.title) d.title = "Данж";
    if (!Number.isFinite(Number(d.cellFt)) || Number(d.cellFt) <= 0) d.cellFt = 5;
    if (!Number.isFinite(Number(d.torchFt))) d.torchFt = 15;
    if (!Number.isFinite(Number(d.darkvisionFt))) d.darkvisionFt = 60;
    if (d.screen == null) d.screen = false;
    if (!d.underlay || typeof d.underlay !== "object") d.underlay = { alpha: 0.88 };
    if (!Number.isFinite(Number(d.underlay.alpha))) d.underlay.alpha = 0.88;
    delete d.underlay.preview;
    if (String(d.underlay.custom || "").indexOf("blob:") === 0) d.underlay.custom = "";
    if (!Array.isArray(d.assets)) d.assets = [];
    if (!d.doorType) d.doorType = "wood";
    if (d.autoWalls == null) d.autoWalls = true;
    if (!d.brushProp) d.brushProp = "lever";

    /* migrate flat levels → sites (убежища) */
    if (!Array.isArray(d.sites) || !d.sites.length) {
      if (!Array.isArray(d.levels) || !d.levels.length) {
        d.sites = [makeSite(d.title || "Убежище 1")];
      } else {
        d.sites = [{
          id: uid(),
          name: d.title || "Убежище 1",
          levels: d.levels,
          activeLevelId: d.activeLevelId || d.levels[0].id,
          props: Array.isArray(d.props) ? d.props : [],
          foes: Array.isArray(d.foes) ? d.foes : [],
          explored: d.explored && typeof d.explored === "object" ? d.explored : {},
          party: d.party || null
        }];
      }
      d.activeSiteId = d.sites[0].id;
    }
    d.sites.forEach(function (site, si) {
      if (!site.id) site.id = uid();
      if (!site.name) site.name = "Убежище " + (si + 1);
      if (!Array.isArray(site.levels) || !site.levels.length) site.levels = [makeLevel("Этаж 1")];
      site.levels.forEach(normalizeLevel);
      if (!site.activeLevelId || !site.levels.some(function (l) { return l.id === site.activeLevelId; })) {
        site.activeLevelId = site.levels[0].id;
      }
      site.props = Array.isArray(site.props) ? site.props : [];
      site.foes = Array.isArray(site.foes) ? site.foes : [];
      if (!site.explored || typeof site.explored !== "object") site.explored = {};
      if (!site.party || typeof site.party !== "object") {
        const start = site.levels[0];
        site.party = {
          x: (start.start && start.start.x) || 1,
          y: (start.start && start.start.y) || 1,
          levelId: start.id,
          dir: 0,
          torch: true,
          darkvision: false
        };
      }
    });
    if (!d.activeSiteId || !d.sites.some(function (s) { return s.id === d.activeSiteId; })) {
      d.activeSiteId = d.sites[0].id;
    }
    const site = activeSite(d);
    d.levels = site.levels;
    d.activeLevelId = site.activeLevelId;
    d.props = site.props;
    d.foes = site.foes;
    d.explored = site.explored;
    d.party = site.party;
    d.title = site.name;

    if (d.underlay.custom && d.levels[0] && !d.levels[0].underlay) {
      d.levels[0].underlay = d.underlay.custom;
    }
    if (!d.party.levelId || !d.levels.some(function (l) { return l.id === d.party.levelId; })) {
      d.party.levelId = d.activeLevelId;
    }
    const pl = levelById(d, d.party.levelId) || d.levels[0];
    d.party.x = Math.max(0, Math.min(pl.w - 1, Math.round(Number(d.party.x) || 0)));
    d.party.y = Math.max(0, Math.min(pl.h - 1, Math.round(Number(d.party.y) || 0)));
    d.party.dir = ((Math.round(Number(d.party.dir) || 0) % 4) + 4) % 4;
    if (d.party.torch == null) d.party.torch = true;
    if (d.party.darkvision == null) d.party.darkvision = false;
    markExplored(d);
    textures();
    return d;
  }

  function levelById(d, id) {
    return (d.levels || []).find(function (l) { return l && l.id === id; }) || null;
  }

  function activeLevel(d) {
    return levelById(d, d.activeLevelId) || d.levels[0];
  }

  function partyLevel(d) {
    return levelById(d, d.party.levelId) || activeLevel(d);
  }

  function doorKey(x, y) { return x + "," + y; }

  function stampFloor(lv, x, y, autoWalls) {
    lv.cells[y][x] = CELL.FLOOR;
    if (!autoWalls) return;
    NEIGH.forEach(function (n) {
      const nx = x + n[0];
      const ny = y + n[1];
      if (nx < 0 || ny < 0 || nx >= lv.w || ny >= lv.h) return;
      if (lv.cells[ny][nx] === CELL.VOID) lv.cells[ny][nx] = CELL.WALL;
    });
  }

  function stampDoor(lv, x, y, doorType) {
    lv.cells[y][x] = CELL.DOOR;
    if (!lv.doors) lv.doors = {};
    lv.doors[doorKey(x, y)] = doorType || "wood";
  }

  function cellAt(level, x, y) {
    if (!level || y < 0 || x < 0 || y >= level.h || x >= level.w) return CELL.WALL;
    const row = level.cells[y];
    return row ? (row[x] | 0) : CELL.WALL;
  }

  function secretOpen(d, levelId, x, y) {
    return (d.props || []).some(function (p) {
      return p && p.kind === "secretDoor" && p.levelId === levelId && p.x === x && p.y === y && p.revealed;
    });
  }

  function effectiveCell(d, level, x, y) {
    const kind = cellAt(level, x, y);
    if (kind === CELL.SECRET && secretOpen(d, level.id, x, y)) return CELL.DOOR;
    return kind;
  }

  function walkable(kind) {
    return kind === CELL.FLOOR || kind === CELL.DOOR || kind === CELL.BRIDGE ||
      kind === CELL.STAIR_UP || kind === CELL.STAIR_DOWN;
  }

  function visionRange(d) {
    const party = d.party || {};
    const cellFt = Number(d.cellFt) || 5;
    if (party.darkvision) return Math.max(1, (Number(d.darkvisionFt) || 60) / cellFt);
    if (party.torch === false) return 0.6;
    return Math.max(0.6, (Number(d.torchFt) || 15) / cellFt);
  }

  function keyOf(levelId, x, y) {
    return levelId + ":" + x + ":" + y;
  }

  function hasLos(d, level, x0, y0, x1, y1) {
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
        const kind = effectiveCell(d, level, x, y);
        if (kind === CELL.WALL || kind === CELL.SECRET) return false;
        if (kind === CELL.DOOR && !(x === x1 && y === y1)) return false;
      }
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  function markExplored(d) {
    const level = partyLevel(d);
    if (!level) return;
    const party = d.party;
    const range = Math.ceil(visionRange(d));
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        if (dx * dx + dy * dy > (range + 0.25) * (range + 0.25)) continue;
        const x = party.x + dx;
        const y = party.y + dy;
        if (x < 0 || y < 0 || x >= level.w || y >= level.h) continue;
        if (!hasLos(d, level, party.x, party.y, x, y)) continue;
        d.explored[keyOf(level.id, x, y)] = true;
      }
    }
  }

  function dist2(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function texForCell(kind, master) {
    const t = textures();
    if (kind === CELL.DOOR) return t.door;
    if (kind === CELL.SECRET) return master ? t.secret : t.wall;
    if (kind === CELL.BRIDGE) return t.wood;
    return t.wall;
  }

  function project(campaign) {
    const d = ensure(campaign);
    const level = partyLevel(d);
    const battle = campaign.battle;
    const actors = (battle && battle.actors) || [];
    const turn = Math.max(0, Math.round(Number(battle && battle.turn) || 0));
    return {
      kind: "dungeon",
      title: d.title || "Данж",
      cellFt: d.cellFt,
      torchFt: d.torchFt,
      darkvisionFt: d.darkvisionFt,
      party: {
        x: d.party.x,
        y: d.party.y,
        levelId: d.party.levelId,
        dir: d.party.dir,
        torch: !!d.party.torch,
        darkvision: !!d.party.darkvision
      },
      level: {
        id: level.id,
        name: level.name,
        w: level.w,
        h: level.h,
        cells: level.cells
      },
      levels: d.levels.map(function (l) { return { id: l.id, name: l.name }; }),
      props: (d.props || []).filter(function (p) { return p.levelId === level.id; }).map(function (p) {
        return {
          id: p.id, x: p.x, y: p.y, kind: p.kind, name: p.name || "",
          revealed: !!p.revealed, secret: !!p.secret
        };
      }),
      foes: (d.foes || []).filter(function (f) { return f.levelId === level.id; }).map(function (f) {
        const actor = actors.find(function (a) { return a && a.id === f.actorId; });
        return {
          id: f.id, x: f.x, y: f.y, actorId: f.actorId || "",
          name: (actor && actor.name) || f.name || "Враг",
          portrait: (actor && actor.portrait) || "",
          dead: !!(actor && actor.dead)
        };
      }),
      explored: d.explored || {},
      flash: d.flash || null,
      battle: actors.length ? {
        round: Math.max(1, Math.round(Number(battle.round) || 1)),
        turn: turn,
        actors: actors.filter(function (a) { return a && String(a.name || "").trim(); }).map(function (actor, index) {
          return {
            id: actor.id,
            name: actor.name || "—",
            side: actor.side === "player" ? "player" : "foe",
            portrait: actor.portrait || "",
            dead: !!actor.dead,
            active: index === turn
          };
        })
      } : null
    };
  }

  function initStripHtml(battle, clickable) {
    if (!battle || !(battle.actors || []).length) return "";
    const tokens = battle.actors.map(function (actor) {
      const face = actor.portrait
        ? '<img alt="" src="' + esc(actor.portrait) + '">'
        : "<span>" + esc((actor.name || "?").slice(0, 1)) + "</span>";
      const cls = "dung-tok " + (actor.side === "player" ? "is-player" : "is-foe") +
        (actor.active ? " is-on" : "") + (actor.dead ? " is-dead" : "");
      return clickable
        ? '<button type="button" class="' + cls + '" data-dung-turn="' + esc(actor.id) + '">' + face + "<em>" + esc(actor.name) + "</em></button>"
        : '<div class="' + cls + '">' + face + "<em>" + esc(actor.name) + "</em></div>";
    }).join("");
    return '<div class="dung-init"><span class="dung-round">Раунд <b>' + esc(battle.round || 1) + "</b></span>" +
      '<div class="dung-track">' + tokens + "</div></div>";
  }

  function playerHtml(page) {
    return '<div class="stage play-dungeon" data-dungeon-stage>' +
      '<canvas class="dung-fp" width="960" height="540" aria-label="Данж"></canvas>' +
      '<div class="dung-hud">' +
      '<canvas class="dung-mini" width="200" height="200" aria-label="Миникарта"></canvas>' +
      '<div class="dung-meta"><b>' + esc(page.title || "Данж") + "</b>" +
      "<span>" + esc((page.level && page.level.name) || "") + " · факел " + esc(page.torchFt || 15) + "фт</span></div>" +
      "</div>" +
      (page.battle ? initStripHtml(page.battle, false) : "") +
      '<div class="dung-flash" hidden></div></div>';
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
    const range = master ? 48 : visionRange(page);
    const tset = textures();
    const rdx = dir.x;
    const rdy = dir.y;
    const planeScale = Math.tan(Math.PI / 6);
    const planeX = -rdy * planeScale;
    const planeY = rdx * planeScale;

    ctx.fillStyle = "#050403";
    ctx.fillRect(0, 0, w, h);

    /* потолок / пол градиентом + намёк текстур */
    const ceil = ctx.createLinearGradient(0, 0, 0, h / 2);
    ceil.addColorStop(0, "#14110e");
    ceil.addColorStop(1, "#0a0806");
    ctx.fillStyle = ceil;
    ctx.fillRect(0, 0, w, h / 2);
    const floor = ctx.createLinearGradient(0, h / 2, 0, h);
    floor.addColorStop(0, "#2a2218");
    floor.addColorStop(1, "#100e0a");
    ctx.fillStyle = floor;
    ctx.fillRect(0, h / 2, w, h / 2);

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
      for (let i = 0; i < 64; i++) {
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
        if (kind === CELL.WALL || kind === CELL.SECRET || kind === CELL.DOOR || kind === CELL.STAIR_UP || kind === CELL.STAIR_DOWN) {
          hit = 1;
          break;
        }
      }
      let perp = hit
        ? (side === 0
          ? (mapX - camX + (1 - stepX) / 2) / rayDirX
          : (mapY - camY + (1 - stepY) / 2) / rayDirY)
        : 40;
      if (perp < 0.05) perp = 0.05;
      const lineH = Math.floor(h / perp);
      const drawStart = Math.max(0, (-lineH / 2 + h / 2) | 0);
      const drawEnd = Math.min(h - 1, (lineH / 2 + h / 2) | 0);

      if (hit && perp <= range + 0.8) {
        let wallX = side === 0 ? camY + perp * rayDirY : camX + perp * rayDirX;
        wallX -= Math.floor(wallX);
        let texX = (wallX * TEX) | 0;
        if (side === 0 && rayDirX > 0) texX = TEX - texX - 1;
        if (side === 1 && rayDirY < 0) texX = TEX - texX - 1;
        const tex = texForCell(kind, master);
        const fog = Math.min(1, perp / Math.max(range, 0.5));
        const shade = (side ? 0.7 : 1) * (1 - fog * 0.85);
        ctx.globalAlpha = Math.max(0.15, shade);
        ctx.drawImage(tex, texX, 0, 1, TEX, col, drawStart, 1, drawEnd - drawStart + 1);
        ctx.globalAlpha = 1;
        if (kind === CELL.STAIR_UP || kind === CELL.STAIR_DOWN) {
          ctx.fillStyle = "rgba(230,195,106," + (0.25 * (1 - fog)) + ")";
          ctx.fillRect(col, drawStart, 1, drawEnd - drawStart + 1);
        }
      } else if (!master) {
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillRect(col, 0, 1, h);
      }
    }

    const sprites = [];
    (page.foes || []).forEach(function (f) {
      if (!f || f.dead) return;
      const dist = dist2(camX, camY, f.x + 0.5, f.y + 0.5);
      if (!master && dist > range) return;
      if (!master && !hasLos(page, level, party.x, party.y, f.x, f.y)) return;
      sprites.push({ x: f.x + 0.5, y: f.y + 0.5, dist: dist, kind: "foe", label: f.name, portrait: f.portrait });
    });
    (page.props || []).forEach(function (p) {
      if (!p) return;
      if (p.secret && !p.revealed && !master) return;
      const dist = dist2(camX, camY, p.x + 0.5, p.y + 0.5);
      if (!master && dist > range) return;
      sprites.push({
        x: p.x + 0.5, y: p.y + 0.5, dist: dist,
        kind: p.kind || "note",
        label: p.name || "",
        secret: !!p.secret && !p.revealed
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
      const spriteH = Math.abs(h / transformY * 0.65) | 0;
      const spriteW = spriteH;
      const screenX = (w / 2 * (1 + transformX / transformY)) | 0;
      const drawX = (screenX - spriteW / 2) | 0;
      const drawY = (h / 2 - spriteH / 2) | 0;
      const fog = Math.min(1, sp.dist / Math.max(range, 0.5));
      ctx.globalAlpha = (master && sp.secret ? 0.55 : 1) * (1 - fog * 0.7);
      const ic = iconOf(sp.kind === "foe" ? "foe" : sp.kind, Math.max(32, Math.min(128, spriteW)));
      ctx.drawImage(ic, drawX, drawY, spriteW, spriteH);
      ctx.globalAlpha = 1;
      if (spriteH > 36 && sp.label) {
        ctx.fillStyle = "rgba(243,234,216," + (0.9 - fog * 0.5) + ")";
        ctx.font = "12px Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillText(sp.label, screenX, drawY - 4);
      }
    });

    if (!master) {
      const g = ctx.createRadialGradient(w / 2, h * 0.55, h * 0.05, w / 2, h * 0.55, h * 0.75);
      g.addColorStop(0, "rgba(255,180,80,0.06)");
      g.addColorStop(0.35, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0," + (page.party.torch || page.party.darkvision ? 0.78 : 0.95) + ")");
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
        const seen = master || page.explored[keyOf(level.id, x, y)];
        if (!seen) continue;
        const kind = effectiveCell(page, level, x, y);
        if (kind === CELL.VOID) continue;
        if (kind === CELL.WALL || kind === CELL.SECRET) ctx.fillStyle = "#5a5248";
        else if (kind === CELL.DOOR) ctx.fillStyle = "#a07840";
        else if (kind === CELL.CHASM) ctx.fillStyle = "#120c0a";
        else if (kind === CELL.BRIDGE) ctx.fillStyle = "#6a5230";
        else if (kind === CELL.STAIR_UP || kind === CELL.STAIR_DOWN) ctx.fillStyle = "#c4a35a";
        else ctx.fillStyle = "#2e2a22";
        ctx.fillRect(ox + x * cell, oy + y * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    (page.foes || []).forEach(function (f) {
      if (!f || f.dead) return;
      if (!master && !page.explored[keyOf(level.id, f.x, f.y)]) return;
      ctx.drawImage(iconOf("foe", 16), ox + f.x * cell, oy + f.y * cell, cell, cell);
    });
    const dir = DIRS[party.dir || 0];
    const px = ox + (party.x + 0.5) * cell;
    const py = oy + (party.y + 0.5) * cell;
    ctx.fillStyle = "#e6c36a";
    ctx.beginPath();
    ctx.moveTo(px + dir.x * cell * 0.45, py + dir.y * cell * 0.45);
    ctx.lineTo(px - dir.x * cell * 0.3 - dir.y * cell * 0.28, py - dir.y * cell * 0.3 + dir.x * cell * 0.28);
    ctx.lineTo(px - dir.x * cell * 0.3 + dir.y * cell * 0.28, py - dir.y * cell * 0.3 - dir.x * cell * 0.28);
    ctx.closePath();
    ctx.fill();
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
      setTimeout(function () { flash.hidden = true; }, 1600);
    }
  }

  /* effectiveCell/hasLos for projected page (props without levelId filter already) */
  function effectiveCell(pageOrD, level, x, y) {
    const kind = cellAt(level, x, y);
    const props = pageOrD.props || [];
    if (kind === CELL.SECRET) {
      const open = props.some(function (p) {
        return p && p.kind === "secretDoor" && p.x === x && p.y === y && p.revealed &&
          (!p.levelId || !level.id || p.levelId === level.id);
      });
      if (open) return CELL.DOOR;
    }
    return kind;
  }

  function hasLos(pageOrD, level, x0, y0, x1, y1) {
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

  function visionRange(pageOrD) {
    const party = pageOrD.party || {};
    const cellFt = Number(pageOrD.cellFt) || 5;
    if (party.darkvision) return Math.max(1, (Number(pageOrD.darkvisionFt) || 60) / cellFt);
    if (party.torch === false) return 0.6;
    return Math.max(0.6, (Number(pageOrD.torchFt) || 15) / cellFt);
  }

  function mount(host, ctx) {
    if (!host || !ctx || !ctx.campaign) return;
    const d = ensure(ctx.campaign);
    let tool = "floor";
    let propKind = d.brushProp || "lever";
    let paint = false;
    let pan = { x: 0, y: 0 };
    let zoom = 1;
    let spaceDown = false;
    let panning = false;
    let panFrom = null;
    let underDrag = null;
    let localUnder = "";
    let underSaveTimer = 0;

    host.innerHTML =
      '<div class="dung-work">' +
      '<aside class="dung-side">' +
      '<div class="dung-side-head"><h2>Данж</h2>' +
      '<label class="check" title="Экран игроков">Экран<input type="checkbox" data-dung="screen"' + (d.screen ? " checked" : "") + "></label></div>" +

      '<div class="dung-sites">' +
      '<div class="dung-floors-head"><span>Убежища</span>' +
      '<button type="button" data-site-add title="Новое убежище">+</button></div>' +
      '<div class="dung-site-list" data-site-list></div>' +
      '<input class="dung-title" data-dung="title" type="text" value="' + esc(d.title) + '" title="Имя убежища">' +
      "</div>" +

      '<div class="dung-floors">' +
      '<div class="dung-floors-head"><span>Этажи</span>' +
      '<button type="button" data-floor-add title="Новый этаж">+</button></div>' +
      '<div class="dung-floor-list" data-floor-list></div></div>' +

      '<div class="dung-under-box">' +
      '<p class="dung-under-title">Подложка</p>' +
      '<label class="dung-upload"><span>Загрузить карту</span>' +
      '<input type="file" accept="image/*" data-dung-upload></label>' +
      '<p class="note" data-dung-upload-status>СКМ — колесо инструментов · Пробел+тяни — панорама.</p>' +
      '<label>Яркость<input data-dung="alpha" type="range" min="20" max="100" value="' + Math.round((d.underlay.alpha || 0.88) * 100) + '"></label>' +
      '<div class="dung-under-fine">' +
      '<label>Масштаб %<input data-dung="under-scale" type="number" min="25" max="300" step="0.5" value="100"></label>' +
      '<label>X кл<input data-dung="under-x" type="number" step="0.05" value="0"></label>' +
      '<label>Y кл<input data-dung="under-y" type="number" step="0.05" value="0"></label>' +
      "</div>" +
      '<div class="dung-under-nudge" data-under-nudge>' +
      '<button type="button" data-nudge="scale:-1" title="Мельче">−</button>' +
      '<button type="button" data-nudge="scale:1" title="Крупнее">+</button>' +
      '<button type="button" data-nudge="x:-1" title="Влево">←</button>' +
      '<button type="button" data-nudge="x:1" title="Вправо">→</button>' +
      '<button type="button" data-nudge="y:-1" title="Вверх">↑</button>' +
      '<button type="button" data-nudge="y:1" title="Вниз">↓</button>' +
      '<button type="button" data-nudge="reset" title="Сброс">⟲</button>' +
      "</div>" +
      '<p class="note">Alt+тяни подложку · Alt+колёсико — масштаб</p>' +
      '<button type="button" data-dung-clear-under>Убрать</button></div>' +

      '<div class="dung-tool-panel" data-tools></div>' +
      '<label class="check dung-autowall">Автостены у пола<input type="checkbox" data-dung="autowalls"' + (d.autoWalls !== false ? " checked" : "") + "></label>" +
      '<div class="dung-door-types" data-door-types></div>' +
      '<div class="dung-props" data-prop-palette></div>' +

      '<details class="dung-assets">' +
      '<summary>Ассеты / текстуры</summary>' +
      '<p class="note">Свои PNG/WebP. Оригиналы Heretic/Hexen — коммерческие; свободный IWAD: Blasphemer (0BSD). Сюда грузишь wall/floor.</p>' +
      '<label class="dung-upload slim"><span>Wall</span><input type="file" accept="image/*" data-asset-upload="wall"></label>' +
      '<label class="dung-upload slim"><span>Floor</span><input type="file" accept="image/*" data-asset-upload="floor"></label>' +
      '<label class="dung-upload slim"><span>Door</span><input type="file" accept="image/*" data-asset-upload="door"></label>' +
      '<div data-asset-list class="dung-asset-list"></div></details>' +

      '<div class="dung-light">' +
      '<label>Факел<input data-dung="torch" type="number" min="5" max="120" value="' + esc(d.torchFt) + '"></label>' +
      '<label class="check">Огонь<input type="checkbox" data-dung="partyTorch"' + (d.party.torch ? " checked" : "") + "></label>" +
      '<label class="check">ТЗ<input type="checkbox" data-dung="darkvision"' + (d.party.darkvision ? " checked" : "") + "></label>" +
      "</div>" +

      '<div class="dung-move">' +
      '<button type="button" data-move="left" title="Влево">⟲</button>' +
      '<button type="button" data-move="forward" title="Вперёд">↑</button>' +
      '<button type="button" data-move="right" title="Вправо">⟳</button>' +
      '<button type="button" data-move="back" title="Назад">↓</button></div>' +

      '<div class="dung-init-host"></div>' +
      '<div class="dung-secret-box" hidden>' +
      '<p class="hero-label">Секрет</p>' +
      '<label>Имя<input data-secret-name type="text"></label>' +
      '<label>DC<input data-secret-dc type="number" min="1" max="30" value="15"></label>' +
      '<button type="button" class="primary" data-secret-check>Проверка</button>' +
      '<button type="button" data-secret-reveal>Открыть</button></div>' +
      "</aside>" +

      '<div class="dung-main">' +
      '<div class="dung-board">' +
      '<div class="dung-edit-wrap" data-edit-wrap>' +
      '<img class="dung-under-img" alt="" draggable="false" hidden>' +
      '<canvas class="dung-grid" width="960" height="1120"></canvas></div>' +
      '<div class="dung-radial" data-radial hidden></div></div>' +
      '<div class="dung-preview">' +
      '<p class="dung-under-title">Вид игрока</p>' +
      '<canvas class="dung-fp" width="480" height="270"></canvas>' +
      '<canvas class="dung-mini" width="180" height="180"></canvas></div>' +
      "</div></div>";

    const grid = host.querySelector(".dung-grid");
    const underDom = host.querySelector(".dung-under-img");
    const editWrap = host.querySelector("[data-edit-wrap]");
    const board = host.querySelector(".dung-board");
    const preview = host.querySelector(".dung-preview");
    const statusEl = host.querySelector("[data-dung-upload-status]");
    const secretBox = host.querySelector(".dung-secret-box");
    let selectedProp = null;
    const underImg = new Image();
    underImg.onload = function () {
      underDom.hidden = false;
      underDom.src = underImg.src;
      paintAll();
    };
    underImg.onerror = function () {
      underDom.hidden = true;
      if (statusEl) statusEl.textContent = "Карта не открылась — загрузи ещё раз.";
    };

    function saveSoon() {
      markExplored(d);
      flushSite(d);
      delete d.underlay.preview;
      const snap = d.levels.map(function (l) { return l.underlay; });
      d.levels.forEach(function (l) {
        if (String(l.underlay || "").indexOf("blob:") === 0) l.underlay = l._savedUnder || "";
      });
      if (ctx.save) ctx.save();
      d.levels.forEach(function (l, i) { l.underlay = snap[i]; });
    }

    function level() { return activeLevel(d); }

    function syncUnderSliders() {
      const lv = level();
      const scale = host.querySelector("[data-dung=under-scale]");
      const ux = host.querySelector("[data-dung=under-x]");
      const uy = host.querySelector("[data-dung=under-y]");
      if (scale) scale.value = String(Math.round((Number(lv.underScale) || 1) * 1000) / 10);
      if (ux) ux.value = String(Math.round((Number(lv.underX) || 0) * 100) / 100);
      if (uy) uy.value = String(Math.round((Number(lv.underY) || 0) * 100) / 100);
    }

    function setUnderTransform(patch, soft) {
      const lv = level();
      if (patch.scale != null) lv.underScale = Math.max(0.25, Math.min(3, Number(patch.scale) || 1));
      if (patch.x != null) lv.underX = Math.round((Number(patch.x) || 0) * 100) / 100;
      if (patch.y != null) lv.underY = Math.round((Number(patch.y) || 0) * 100) / 100;
      syncUnderSliders();
      paintGrid();
      if (!soft) saveSoon();
    }

    function underUrl() {
      const lv = level();
      if (localUnder) return localUnder;
      return (lv && lv.underlay) || "";
    }

    function syncUnder() {
      const url = underUrl();
      if (!url) {
        underImg.removeAttribute("src");
        underDom.hidden = true;
        underDom.removeAttribute("src");
        return;
      }
      if (underImg.src !== url && underImg.dataset.url !== url) {
        underImg.dataset.url = url;
        underImg.src = url;
      }
      underDom.src = url;
      underDom.hidden = false;
    }

    function paintSites() {
      const box = host.querySelector("[data-site-list]");
      box.innerHTML = d.sites.map(function (s) {
        return '<button type="button" class="dung-floor' + (s.id === d.activeSiteId ? " is-on" : "") + '" data-site="' + esc(s.id) + '">' +
          esc(s.name) +
          (d.sites.length > 1 ? '<span data-site-del="' + esc(s.id) + '" title="Удалить">×</span>' : "") +
          "</button>";
      }).join("");
      host.querySelector("[data-dung=title]").value = d.title || "";
    }

    function paintFloors() {
      const box = host.querySelector("[data-floor-list]");
      box.innerHTML = d.levels.map(function (l) {
        return '<button type="button" class="dung-floor' + (l.id === d.activeLevelId ? " is-on" : "") + '" data-floor="' + esc(l.id) + '">' +
          esc(l.name) +
          (d.levels.length > 1 ? '<span data-floor-del="' + esc(l.id) + '" title="Удалить">×</span>' : "") +
          "</button>";
      }).join("");
    }

    function toolButtonHtml(t, radial) {
      return '<button type="button" class="dung-icon-btn' + (tool === t.id ? " is-on" : "") + '" data-tool="' + t.id + '" title="' + esc(t.label) + '">' +
        '<canvas width="28" height="28" data-tool-icon="' + esc(t.icon || t.id) + '"></canvas>' +
        (radial ? "" : "<em>" + esc(t.label) + "</em>") + "</button>";
    }

    function paintTools() {
      const box = host.querySelector("[data-tools]");
      box.innerHTML = TOOL_GROUPS.map(function (group) {
        return '<div class="dung-tool-group"><p class="dung-under-title">' + esc(group.label) + "</p>" +
          '<div class="dung-icon-row">' + group.tools.map(function (t) { return toolButtonHtml(t, false); }).join("") + "</div></div>";
      }).join("");
      box.querySelectorAll("canvas[data-tool-icon]").forEach(function (c) {
        c.getContext("2d").drawImage(iconOf(c.getAttribute("data-tool-icon"), 28), 0, 0);
      });
      host.querySelector("[data-door-types]").innerHTML = '<p class="dung-under-title">Тип двери</p><div class="dung-icon-row">' +
        DOOR_TYPES.map(function (door) {
          return '<button type="button" class="dung-chip' + (d.doorType === door.id ? " is-on" : "") + '" data-door-type="' + door.id + '">' + esc(door.name) + "</button>";
        }).join("") + "</div>";
    }

    function paintRadial(activeIndex) {
      const radial = host.querySelector("[data-radial]");
      const n = TOOLS.length;
      const size = 220;
      const cx = size / 2;
      const cy = size / 2;
      const outer = 100;
      const inner = 34;
      let wedges = "";
      let icons = "";
      for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const a1 = -Math.PI / 2 + ((i + 1) / n) * Math.PI * 2;
        const x0 = cx + Math.cos(a0) * outer;
        const y0 = cy + Math.sin(a0) * outer;
        const x1 = cx + Math.cos(a1) * outer;
        const y1 = cy + Math.sin(a1) * outer;
        const xi0 = cx + Math.cos(a1) * inner;
        const yi0 = cy + Math.sin(a1) * inner;
        const xi1 = cx + Math.cos(a0) * inner;
        const yi1 = cy + Math.sin(a0) * inner;
        const large = (a1 - a0) > Math.PI ? 1 : 0;
        const d = "M " + x0 + " " + y0 +
          " A " + outer + " " + outer + " 0 " + large + " 1 " + x1 + " " + y1 +
          " L " + xi0 + " " + yi0 +
          " A " + inner + " " + inner + " 0 " + large + " 0 " + xi1 + " " + yi1 + " Z";
        const on = activeIndex === i || (activeIndex == null && TOOLS[i].id === tool);
        wedges += '<path data-radial-i="' + i + '" data-tool="' + TOOLS[i].id + '" d="' + d + '" class="dung-wedge' + (on ? " is-on" : "") + '">' +
          '<title>' + esc(TOOLS[i].label) + "</title></path>";
        const mid = (a0 + a1) / 2;
        const ix = cx + Math.cos(mid) * ((inner + outer) / 2) - 14;
        const iy = cy + Math.sin(mid) * ((inner + outer) / 2) - 14;
        icons += '<canvas class="dung-wedge-icon" width="28" height="28" data-tool-icon="' + esc(TOOLS[i].icon || TOOLS[i].id) +
          '" style="left:' + ix + "px;top:" + iy + 'px"></canvas>';
      }
      radial.innerHTML =
        '<svg class="dung-radial-svg" viewBox="0 0 ' + size + " " + size + '" width="' + size + '" height="' + size + '">' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + (outer + 2) + '" class="dung-radial-ring"/>' +
        wedges +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + inner + '" class="dung-radial-hub"/>' +
        '<text x="' + cx + '" y="' + (cy + 4) + '" class="dung-radial-hub-text">СКМ</text></svg>' + icons;
      radial.querySelectorAll("canvas[data-tool-icon]").forEach(function (c) {
        c.getContext("2d").drawImage(iconOf(c.getAttribute("data-tool-icon"), 28), 0, 0);
      });
      radial._size = size;
    }

    function paintPropPalette() {
      const box = host.querySelector("[data-prop-palette]");
      box.innerHTML = '<p class="dung-under-title">Объекты</p><div class="dung-prop-grid">' +
        PROP_KINDS.map(function (p) {
          return '<button type="button" class="dung-prop-btn' + (propKind === p.id ? " is-on" : "") + '" data-prop-kind="' + p.id + '" title="' + esc(p.name) + '">' +
            '<canvas width="36" height="36" data-icon="' + p.id + '"></canvas></button>';
        }).join("") + "</div>";
      box.querySelectorAll("canvas[data-icon]").forEach(function (c) {
        c.getContext("2d").drawImage(iconOf(c.getAttribute("data-icon"), 36), 0, 0);
      });
    }

    function paintAssets() {
      const box = host.querySelector("[data-asset-list]");
      if (!box) return;
      box.innerHTML = (d.assets || []).map(function (a) {
        return '<div class="dung-asset-row"><img alt="" src="' + esc(a.url) + '"><span>' + esc(a.role) + " · " + esc(a.name || "") +
          '</span><button type="button" data-asset-del="' + esc(a.id) + '">×</button></div>';
      }).join("") || '<p class="note">Пока пусто.</p>';
    }

    function paintInit() {
      const box = host.querySelector(".dung-init-host");
      const page = project(ctx.campaign);
      box.innerHTML = page.battle
        ? initStripHtml(page.battle, true) + '<div class="row"><button type="button" data-dung-next>След. ход</button></div>'
        : '<p class="note">Поставь врага кистью «Враг» или добавь в Бой.</p>';
    }

    function paintGrid() {
      const lv = level();
      const ctx2 = grid.getContext("2d");
      const base = Math.min(grid.width / lv.w, grid.height / lv.h);
      const cell = base * zoom;
      const ox = (grid.width - lv.w * cell) / 2 + pan.x;
      const oy = (grid.height - lv.h * cell) / 2 + pan.y;
      const mapW = lv.w * cell;
      const mapH = lv.h * cell;
      const us = Math.max(0.25, Math.min(3, Number(lv.underScale) || 1));
      const uox = (Number(lv.underX) || 0) * cell;
      const uoy = (Number(lv.underY) || 0) * cell;
      underDom.style.left = ox + uox - (mapW * (us - 1)) / 2 + "px";
      underDom.style.top = oy + uoy - (mapH * (us - 1)) / 2 + "px";
      underDom.style.width = mapW * us + "px";
      underDom.style.height = mapH * us + "px";
      underDom.style.opacity = String(Math.max(0.2, Math.min(1, Number(d.underlay.alpha) || 0.88)));

      ctx2.clearRect(0, 0, grid.width, grid.height);
      if (!underUrl()) {
        ctx2.fillStyle = "#12100c";
        ctx2.fillRect(0, 0, grid.width, grid.height);
        const pat = ctx2.createPattern(textures().floor, "repeat");
        if (pat) {
          ctx2.globalAlpha = 0.35;
          ctx2.fillStyle = pat;
          ctx2.fillRect(ox, oy, mapW, mapH);
          ctx2.globalAlpha = 1;
        }
      }

      for (let y = 0; y < lv.h; y++) {
        for (let x = 0; x < lv.w; x++) {
          const kind = cellAt(lv, x, y);
          if (kind === CELL.VOID) continue;
          const colors = {
            1: "rgba(210, 180, 100, 0.42)",
            2: "rgba(18, 16, 14, 0.82)",
            3: "rgba(160, 110, 40, 0.7)",
            4: "rgba(230, 195, 80, 0.65)",
            5: "rgba(5, 4, 8, 0.85)",
            6: "rgba(120, 85, 40, 0.65)",
            7: "rgba(230,195,106,0.55)",
            8: "rgba(180,140,70,0.55)"
          };
          ctx2.fillStyle = colors[kind] || "rgba(60,60,60,0.4)";
          ctx2.fillRect(ox + x * cell, oy + y * cell, cell + 0.4, cell + 0.4);
          if (kind === CELL.DOOR) {
            const dtype = (lv.doors && lv.doors[doorKey(x, y)]) || "wood";
            ctx2.fillStyle = dtype === "iron" ? "#8a949a" : (dtype === "bars" ? "#6a7080" : (dtype === "locked" ? "#c46b2a" : "#a07840"));
            ctx2.fillRect(ox + x * cell + cell * 0.3, oy + y * cell + cell * 0.15, cell * 0.4, cell * 0.7);
          }
          if (kind === CELL.STAIR_UP || kind === CELL.STAIR_DOWN) {
            ctx2.fillStyle = "#e6c36a";
            ctx2.font = Math.max(10, cell * 0.55) + "px Georgia";
            ctx2.textAlign = "center";
            ctx2.textBaseline = "middle";
            ctx2.fillText(kind === CELL.STAIR_UP ? "▲" : "▼", ox + (x + 0.5) * cell, oy + (y + 0.5) * cell);
          }
        }
      }

      ctx2.strokeStyle = "rgba(230,195,106,0.55)";
      ctx2.lineWidth = 1;
      for (let x = 0; x <= lv.w; x++) {
        ctx2.beginPath();
        ctx2.moveTo(ox + x * cell, oy);
        ctx2.lineTo(ox + x * cell, oy + mapH);
        ctx2.stroke();
      }
      for (let y = 0; y <= lv.h; y++) {
        ctx2.beginPath();
        ctx2.moveTo(ox, oy + y * cell);
        ctx2.lineTo(ox + mapW, oy + y * cell);
        ctx2.stroke();
      }

      (d.props || []).filter(function (p) { return p.levelId === lv.id; }).forEach(function (p) {
        const ic = iconOf(p.kind || "note", Math.max(16, (cell * 0.85) | 0));
        ctx2.globalAlpha = p.revealed ? 1 : (p.secret ? 0.85 : 1);
        ctx2.drawImage(ic, ox + p.x * cell + cell * 0.05, oy + p.y * cell + cell * 0.05, cell * 0.9, cell * 0.9);
        ctx2.globalAlpha = 1;
        if (selectedProp && selectedProp.id === p.id) {
          ctx2.strokeStyle = "#fff";
          ctx2.lineWidth = 2;
          ctx2.strokeRect(ox + p.x * cell, oy + p.y * cell, cell, cell);
        }
      });

      (d.foes || []).filter(function (f) { return f.levelId === lv.id; }).forEach(function (f) {
        ctx2.drawImage(iconOf("foe", Math.max(16, (cell * 0.9) | 0)), ox + f.x * cell + cell * 0.05, oy + f.y * cell + cell * 0.05, cell * 0.9, cell * 0.9);
      });

      if (d.party.levelId === lv.id) {
        const dir = DIRS[d.party.dir || 0];
        const px = ox + (d.party.x + 0.5) * cell;
        const py = oy + (d.party.y + 0.5) * cell;
        ctx2.fillStyle = "#e6c36a";
        ctx2.beginPath();
        ctx2.moveTo(px + dir.x * cell * 0.42, py + dir.y * cell * 0.42);
        ctx2.lineTo(px - dir.x * cell * 0.28 - dir.y * cell * 0.26, py - dir.y * cell * 0.28 + dir.x * cell * 0.26);
        ctx2.lineTo(px - dir.x * cell * 0.28 + dir.y * cell * 0.26, py - dir.y * cell * 0.28 - dir.x * cell * 0.26);
        ctx2.closePath();
        ctx2.fill();
      }

      grid._cell = cell;
      grid._ox = ox;
      grid._oy = oy;
      secretBox.hidden = !selectedProp;
      if (selectedProp) {
        host.querySelector("[data-secret-name]").value = selectedProp.name || "";
        host.querySelector("[data-secret-dc]").value = String(selectedProp.dc || 15);
      }
    }

    function paintPreview() {
      /* temporarily point party view to active floor for preview if same */
      const page = project(ctx.campaign);
      if (d.activeLevelId !== d.party.levelId) {
        const lv = level();
        page.level = { id: lv.id, name: lv.name, w: lv.w, h: lv.h, cells: lv.cells };
        page.props = (d.props || []).filter(function (p) { return p.levelId === lv.id; });
        page.foes = (d.foes || []).filter(function (f) { return f.levelId === lv.id; }).map(function (f) {
          return { id: f.id, x: f.x, y: f.y, name: f.name || "Враг", dead: false };
        });
      }
      paintView(preview, page, { master: true });
    }

    function paintAll() {
      paintSites();
      paintFloors();
      paintTools();
      paintRadial();
      paintPropPalette();
      paintAssets();
      syncUnderSliders();
      syncUnder();
      paintGrid();
      paintPreview();
      paintInit();
    }

    function cellFromEvent(event) {
      const rect = grid.getBoundingClientRect();
      const scaleX = grid.width / rect.width;
      const scaleY = grid.height / rect.height;
      const mx = (event.clientX - rect.left) * scaleX;
      const my = (event.clientY - rect.top) * scaleY;
      const x = Math.floor((mx - grid._ox) / grid._cell);
      const y = Math.floor((my - grid._oy) / grid._cell);
      const lv = level();
      if (x < 0 || y < 0 || x >= lv.w || y >= lv.h) return null;
      return { x: x, y: y };
    }

    function applyBrush(at) {
      if (!at) return;
      const lv = level();
      if (tool === "party") {
        d.party.x = at.x;
        d.party.y = at.y;
        d.party.levelId = lv.id;
        markExplored(d);
        paintAll();
        saveSoon();
        return;
      }
      if (tool === "foe") {
        const battle = window.ShirmoBattle ? window.ShirmoBattle.ensure(ctx.campaign) : null;
        let actor = null;
        if (battle) {
          actor = {
            id: uid(), name: "Враг", side: "foe", hp: 11, hpMax: 11, ac: 13,
            init: 10, initBonus: 1, dead: false, weapon: "Скимитар", damage: "1d6+1",
            bonus: 3, portrait: "", marks: [], note: "Данж"
          };
          battle.actors.push(actor);
          window.ShirmoBattle.ensure(ctx.campaign);
        }
        d.foes.push({ id: uid(), x: at.x, y: at.y, levelId: lv.id, actorId: actor ? actor.id : "", name: "Враг" });
        paintAll();
        saveSoon();
        return;
      }
      if (tool === "prop") {
        const meta = PROP_KINDS.find(function (p) { return p.id === propKind; }) || PROP_KINDS[0];
        const prop = {
          id: uid(), x: at.x, y: at.y, levelId: lv.id,
          kind: meta.id, name: meta.name, secret: !!meta.secret,
          revealed: !meta.secret, dc: meta.dc || 15, skill: "Внимание"
        };
        d.props.push(prop);
        selectedProp = prop;
        if (meta.id === "secretDoor") lv.cells[at.y][at.x] = CELL.SECRET;
        paintAll();
        saveSoon();
        return;
      }
      const hit = (d.props || []).find(function (p) { return p.levelId === lv.id && p.x === at.x && p.y === at.y; });
      if (hit && tool !== "erase") {
        selectedProp = hit;
        paintGrid();
        return;
      }
      const t = TOOLS.find(function (row) { return row.id === tool; });
      if (!t || t.cell == null) return;
      if (tool === "floor") {
        stampFloor(lv, at.x, at.y, d.autoWalls !== false);
      } else if (tool === "door") {
        stampDoor(lv, at.x, at.y, d.doorType || "wood");
      } else if (tool === "erase") {
        lv.cells[at.y][at.x] = CELL.VOID;
        if (lv.doors) delete lv.doors[doorKey(at.x, at.y)];
      } else {
        lv.cells[at.y][at.x] = t.cell;
      }
      if (tool === "secret") {
        const exists = d.props.some(function (p) {
          return p.kind === "secretDoor" && p.levelId === lv.id && p.x === at.x && p.y === at.y;
        });
        if (!exists) {
          d.props.push({
            id: uid(), x: at.x, y: at.y, levelId: lv.id,
            kind: "secretDoor", name: "Секретная дверь", secret: true, revealed: false, dc: 15, skill: "Внимание"
          });
        }
      }
      paintGrid();
      paintPreview();
      saveSoon();
    }

    function tryMove(step, turn) {
      if (turn) d.party.dir = ((d.party.dir + turn) % 4 + 4) % 4;
      if (step) {
        const dir = DIRS[d.party.dir];
        const lv = partyLevel(d);
        const nx = d.party.x + dir.x * step;
        const ny = d.party.y + dir.y * step;
        const kind = effectiveCell(d, lv, nx, ny);
        if (walkable(kind)) {
          d.party.x = nx;
          d.party.y = ny;
          if (kind === CELL.STAIR_UP || kind === CELL.STAIR_DOWN) {
            const idx = d.levels.findIndex(function (l) { return l.id === lv.id; });
            const next = kind === CELL.STAIR_UP ? d.levels[idx + 1] : d.levels[idx - 1];
            if (next) {
              d.party.levelId = next.id;
              d.activeLevelId = next.id;
              d.party.x = Math.min(next.w - 1, d.party.x);
              d.party.y = Math.min(next.h - 1, d.party.y);
              localUnder = "";
            }
          }
        }
      }
      markExplored(d);
      paintAll();
      saveSoon();
    }

    function revealProp(prop) {
      if (!prop) return;
      prop.revealed = true;
      if (prop.kind === "secretDoor") {
        const lv = levelById(d, prop.levelId);
        if (lv && cellAt(lv, prop.x, prop.y) === CELL.SECRET) lv.cells[prop.y][prop.x] = CELL.DOOR;
      }
      d.flash = { text: (prop.name || "Секрет") + "!", at: Date.now() };
      setTimeout(function () {
        if (d.flash && Date.now() - d.flash.at > 1500) d.flash = null;
        saveSoon();
      }, 2000);
    }

    /* events */
    function setTool(next) {
      tool = next;
      paintTools();
      paintRadial();
      hideRadial();
    }

    let radialHold = false;
    let radialIndex = -1;

    function hideRadial() {
      const radial = host.querySelector("[data-radial]");
      if (radial) radial.hidden = true;
      radialHold = false;
      radialIndex = -1;
    }

    function radialIndexAt(clientX, clientY) {
      const radial = host.querySelector("[data-radial]");
      if (!radial || radial.hidden) return -1;
      const rect = radial.getBoundingClientRect();
      const size = radial._size || 220;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = size / rect.width;
      const r = dist * scale;
      if (r < 34 || r > 104) return -1;
      let ang = Math.atan2(dy, dx) + Math.PI / 2;
      if (ang < 0) ang += Math.PI * 2;
      const n = TOOLS.length;
      return Math.min(n - 1, Math.floor((ang / (Math.PI * 2)) * n));
    }

    function showRadial(clientX, clientY) {
      const radial = host.querySelector("[data-radial]");
      const boardRect = board.getBoundingClientRect();
      const size = 220;
      radial.hidden = false;
      radial.style.left = Math.max(8, Math.min(boardRect.width - size - 8, clientX - boardRect.left - size / 2)) + "px";
      radial.style.top = Math.max(8, Math.min(boardRect.height - size - 8, clientY - boardRect.top - size / 2)) + "px";
      radialIndex = -1;
      paintRadial(-1);
      radialHold = true;
    }

    host.addEventListener("click", function (event) {
      const toolBtn = event.target.closest("[data-tool]");
      if (toolBtn && (host.querySelector("[data-tools]").contains(toolBtn) || host.querySelector("[data-radial]").contains(toolBtn))) {
        setTool(toolBtn.getAttribute("data-tool"));
        return;
      }
      const doorBtn = event.target.closest("[data-door-type]");
      if (doorBtn) {
        d.doorType = doorBtn.getAttribute("data-door-type");
        tool = "door";
        paintTools();
        return;
      }
    });
    host.querySelector("[data-prop-palette]").addEventListener("click", function (event) {
      const btn = event.target.closest("[data-prop-kind]");
      if (!btn) return;
      propKind = btn.getAttribute("data-prop-kind");
      d.brushProp = propKind;
      setTool("prop");
      paintPropPalette();
    });
    host.querySelector("[data-site-list]").addEventListener("click", function (event) {
      const del = event.target.closest("[data-site-del]");
      if (del) {
        event.stopPropagation();
        if (d.sites.length <= 1) return;
        if (!window.confirm("Удалить убежище?")) return;
        const id = del.getAttribute("data-site-del");
        flushSite(d);
        d.sites = d.sites.filter(function (s) { return s.id !== id; });
        loadSite(d, d.sites[0].id);
        localUnder = "";
        paintAll();
        saveSoon();
        return;
      }
      const btn = event.target.closest("[data-site]");
      if (!btn) return;
      loadSite(d, btn.getAttribute("data-site"));
      localUnder = "";
      selectedProp = null;
      paintAll();
      saveSoon();
    });
    host.querySelector("[data-site-add]").addEventListener("click", function () {
      flushSite(d);
      const site = makeSite("Убежище " + (d.sites.length + 1));
      d.sites.push(site);
      loadSite(d, site.id);
      localUnder = "";
      paintAll();
      saveSoon();
    });
    host.querySelector("[data-floor-list]").addEventListener("click", function (event) {
      const del = event.target.closest("[data-floor-del]");
      if (del) {
        event.stopPropagation();
        const id = del.getAttribute("data-floor-del");
        if (d.levels.length <= 1) return;
        if (!window.confirm("Удалить этаж?")) return;
        d.levels = d.levels.filter(function (l) { return l.id !== id; });
        d.props = d.props.filter(function (p) { return p.levelId !== id; });
        d.foes = d.foes.filter(function (f) { return f.levelId !== id; });
        if (d.activeLevelId === id) d.activeLevelId = d.levels[0].id;
        if (d.party.levelId === id) d.party.levelId = d.levels[0].id;
        localUnder = "";
        paintAll();
        saveSoon();
        return;
      }
      const btn = event.target.closest("[data-floor]");
      if (!btn) return;
      d.activeLevelId = btn.getAttribute("data-floor");
      localUnder = "";
      selectedProp = null;
      paintAll();
      saveSoon();
    });
    host.querySelector("[data-floor-add]").addEventListener("click", function () {
      const lv = makeLevel("Этаж " + (d.levels.length + 1));
      d.levels.push(lv);
      d.activeLevelId = lv.id;
      localUnder = "";
      paintAll();
      saveSoon();
    });

    host.querySelector("[data-dung=title]").addEventListener("change", function () {
      d.title = this.value.trim() || "Убежище";
      const site = activeSite(d);
      if (site) site.name = d.title;
      paintSites();
      saveSoon();
    });
    host.querySelector("[data-dung=autowalls]").addEventListener("change", function () {
      d.autoWalls = !!this.checked;
      saveSoon();
    });
    host.querySelector("[data-dung=screen]").addEventListener("change", function () {
      d.screen = !!this.checked;
      if (d.screen && ctx.campaign.battle) ctx.campaign.battle.screen = false;
      saveSoon();
    });
    host.querySelector("[data-dung=alpha]").addEventListener("input", function () {
      d.underlay.alpha = Math.max(0.2, Math.min(1, Number(this.value) / 100));
      paintGrid();
      saveSoon();
    });
    host.querySelector("[data-dung=under-scale]").addEventListener("change", function () {
      setUnderTransform({ scale: Number(this.value) / 100 });
    });
    host.querySelector("[data-dung=under-x]").addEventListener("change", function () {
      setUnderTransform({ x: Number(this.value) || 0 });
    });
    host.querySelector("[data-dung=under-y]").addEventListener("change", function () {
      setUnderTransform({ y: Number(this.value) || 0 });
    });
    ["under-scale", "under-x", "under-y"].forEach(function (name) {
      host.querySelector("[data-dung=" + name + "]").addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        this.blur();
      });
    });
    host.querySelector("[data-under-nudge]").addEventListener("click", function (event) {
      const btn = event.target.closest("[data-nudge]");
      if (!btn) return;
      const code = btn.getAttribute("data-nudge");
      const lv = level();
      if (code === "reset") {
        setUnderTransform({ scale: 1, x: 0, y: 0 });
        return;
      }
      const parts = code.split(":");
      const axis = parts[0];
      const dir = Number(parts[1]) || 0;
      const fine = event.shiftKey;
      if (axis === "scale") {
        setUnderTransform({ scale: (Number(lv.underScale) || 1) + dir * (fine ? 0.005 : 0.02) });
      } else if (axis === "x") {
        setUnderTransform({ x: (Number(lv.underX) || 0) + dir * (fine ? 0.05 : 0.25) });
      } else if (axis === "y") {
        setUnderTransform({ y: (Number(lv.underY) || 0) + dir * (fine ? 0.05 : 0.25) });
      }
    });
    host.querySelectorAll("[data-asset-upload]").forEach(function (input) {
      input.addEventListener("change", function () {
        const file = this.files && this.files[0];
        const role = this.getAttribute("data-asset-upload");
        this.value = "";
        if (!file || !ctx.upload) return;
        ctx.upload(file).then(function (url) {
          d.assets.push({ id: uid(), name: file.name, url: url, role: role });
          if (role === "wall") {
            const img = new Image();
            img.onload = function () { TEX_SET.wall = img; TEX_SET.brick = img; paintPreview(); };
            img.src = url;
          }
          if (role === "floor") {
            const img = new Image();
            img.onload = function () { TEX_SET.floor = img; paintPreview(); };
            img.src = url;
          }
          if (role === "door") {
            const img = new Image();
            img.onload = function () { TEX_SET.door = img; paintPreview(); };
            img.src = url;
          }
          paintAssets();
          saveSoon();
        });
      });
    });
    host.querySelector("[data-asset-list]").addEventListener("click", function (event) {
      const del = event.target.closest("[data-asset-del]");
      if (!del) return;
      const id = del.getAttribute("data-asset-del");
      d.assets = d.assets.filter(function (a) { return a.id !== id; });
      paintAssets();
      saveSoon();
    });
    host.querySelector("[data-dung=torch]").addEventListener("change", function () {
      d.torchFt = Math.max(5, Math.min(120, Math.round(Number(this.value) || 15)));
      paintAll();
      saveSoon();
    });
    host.querySelector("[data-dung=partyTorch]").addEventListener("change", function () {
      d.party.torch = !!this.checked;
      paintAll();
      saveSoon();
    });
    host.querySelector("[data-dung=darkvision]").addEventListener("change", function () {
      d.party.darkvision = !!this.checked;
      paintAll();
      saveSoon();
    });
    host.querySelector("[data-dung-clear-under]").addEventListener("click", function () {
      localUnder = "";
      level().underlay = "";
      level()._savedUnder = "";
      syncUnder();
      paintGrid();
      if (statusEl) statusEl.textContent = "Подложка убрана.";
      saveSoon();
    });

    host.querySelector("[data-dung-upload]").addEventListener("change", function () {
      const file = this.files && this.files[0];
      this.value = "";
      if (!file) return;
      if (localUnder && localUnder.indexOf("blob:") === 0) {
        try { URL.revokeObjectURL(localUnder); } catch (err) { /* */ }
      }
      localUnder = URL.createObjectURL(file);
      underImg.dataset.url = "";
      underImg.src = localUnder;
      underDom.src = localUnder;
      underDom.hidden = false;
      paintGrid();
      if (statusEl) statusEl.textContent = "На экране: " + file.name;
      if (!ctx.upload) return;
      ctx.upload(file).then(function (url) {
        level().underlay = url;
        level()._savedUnder = url;
        if (statusEl) statusEl.textContent = "Сохранено: " + file.name;
        saveSoon();
      }).catch(function (error) {
        if (statusEl) statusEl.textContent = "На экране есть. Сервер: " + ((error && error.message) || "ошибка");
      });
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

    grid.addEventListener("auxclick", function (event) {
      if (event.button === 1) event.preventDefault();
    });
    grid.addEventListener("mousedown", function (event) {
      if (event.button === 1) {
        event.preventDefault();
        showRadial(event.clientX, event.clientY);
        return;
      }
      if (!host.querySelector("[data-radial]").hidden && event.button === 0) {
        const hit = event.target.closest("[data-tool]");
        if (hit && host.querySelector("[data-radial]").contains(hit)) {
          setTool(hit.getAttribute("data-tool"));
          return;
        }
        hideRadial();
      }
      if (event.altKey && event.button === 0) {
        event.preventDefault();
        const lv = level();
        underDrag = {
          x: event.clientX,
          y: event.clientY,
          underX: Number(lv.underX) || 0,
          underY: Number(lv.underY) || 0,
          cell: grid._cell || 1
        };
        return;
      }
      if (spaceDown) {
        panning = true;
        panFrom = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
        return;
      }
      paint = true;
      applyBrush(cellFromEvent(event));
    });
    grid.addEventListener("mousemove", function (event) {
      if (radialHold) {
        const next = radialIndexAt(event.clientX, event.clientY);
        if (next !== radialIndex) {
          radialIndex = next;
          paintRadial(radialIndex >= 0 ? radialIndex : -1);
        }
        return;
      }
      if (underDrag) {
        const dx = (event.clientX - underDrag.x) / underDrag.cell;
        const dy = (event.clientY - underDrag.y) / underDrag.cell;
        setUnderTransform({
          x: underDrag.underX + dx,
          y: underDrag.underY + dy
        }, true);
        clearTimeout(underSaveTimer);
        underSaveTimer = setTimeout(function () { saveSoon(); }, 400);
        return;
      }
      if (panning && panFrom) {
        pan.x = panFrom.panX + (event.clientX - panFrom.x);
        pan.y = panFrom.panY + (event.clientY - panFrom.y);
        paintGrid();
        return;
      }
      if (!paint) return;
      if (tool === "foe" || tool === "prop" || tool === "party") return;
      applyBrush(cellFromEvent(event));
    });
    window.addEventListener("mouseup", function (event) {
      if (event.button === 1 && radialHold) {
        const pick = radialIndexAt(event.clientX, event.clientY);
        if (pick >= 0 && TOOLS[pick]) setTool(TOOLS[pick].id);
        else hideRadial();
        paint = false;
        panning = false;
        underDrag = null;
        return;
      }
      if (underDrag) {
        underDrag = null;
        saveSoon();
      }
      paint = false;
      panning = false;
    });
    board.addEventListener("wheel", function (event) {
      event.preventDefault();
      if (event.altKey) {
        const lv = level();
        const step = event.shiftKey ? 0.005 : 0.02;
        const next = (Number(lv.underScale) || 1) + (event.deltaY < 0 ? step : -step);
        setUnderTransform({ scale: next }, true);
        clearTimeout(underSaveTimer);
        underSaveTimer = setTimeout(function () { saveSoon(); }, 400);
        return;
      }
      const next = zoom * (event.deltaY < 0 ? 1.08 : 0.92);
      zoom = Math.max(0.35, Math.min(3, next));
      paintGrid();
    }, { passive: false });

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
        paintInit();
        saveSoon();
        return;
      }
      const tok = event.target.closest("[data-dung-turn]");
      if (tok && ctx.campaign.battle) {
        const id = tok.getAttribute("data-dung-turn");
        const index = (ctx.campaign.battle.actors || []).findIndex(function (a) { return a && a.id === id; });
        if (index >= 0) ctx.campaign.battle.turn = index;
        paintInit();
        saveSoon();
      }
    });

    host.querySelector("[data-secret-check]").addEventListener("click", function () {
      if (!selectedProp) return;
      selectedProp.name = host.querySelector("[data-secret-name]").value || selectedProp.name;
      selectedProp.dc = Math.round(Number(host.querySelector("[data-secret-dc]").value) || 15);
      const dc = selectedProp.dc;
      if (ctx.roll) {
        ctx.roll({ name: "Проверка (DC " + dc + ")", count: 1, sides: 20, bonus: 0, mode: "normal" })
          .then(function (data) {
            const roll = (data && data.event && data.event.roll) || data;
            const total = roll && roll.total;
            if (Number(total) >= dc) revealProp(selectedProp);
            else window.alert("Проверка " + total + " / DC " + dc);
            paintAll();
            saveSoon();
          });
      } else if (window.confirm("Успех DC " + dc + "?")) {
        revealProp(selectedProp);
        paintAll();
        saveSoon();
      }
    });
    host.querySelector("[data-secret-reveal]").addEventListener("click", function () {
      if (!selectedProp) return;
      selectedProp.name = host.querySelector("[data-secret-name]").value || selectedProp.name;
      revealProp(selectedProp);
      paintAll();
      saveSoon();
    });

    function onKey(event) {
      if (host.hidden) return;
      if (event.code === "Space") spaceDown = true;
      const tag = event.target && event.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") { event.preventDefault(); tryMove(1, 0); }
      if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") { event.preventDefault(); tryMove(-1, 0); }
      if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") { event.preventDefault(); tryMove(0, -1); }
      if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") { event.preventDefault(); tryMove(0, 1); }
    }
    function onKeyUp(event) {
      if (event.code === "Space") spaceDown = false;
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", onKeyUp);
    host._dungKill = function () {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keyup", onKeyUp);
    };
    host._refresh = paintAll;

    paintAll();
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
