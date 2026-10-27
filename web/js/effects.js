(function () {
  const canvas = document.createElement("canvas");
  canvas.id = "shirmo-fx";
  canvas.className = "shirmo-fx";
  const ctx = canvas.getContext("2d");
  let raf = 0;
  let last = 0;
  let w = 0;
  let h = 0;
  let bits = [];
  let bed = null;
  let bedCtx = null;
  const state = {
    kind: "",
    power: 50,
    speed: 40,
    hand: "#f6e7b0",
    face: "#1a140c",
    storm: false,
    progress: 0,
    appear: 0,
    t: 0
  };

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function rate() { return 0.006 + (clamp(state.speed, 1, 100) / 100) * 0.14; }
  function many(max) { return Math.max(4, Math.round(max * clamp(state.power, 1, 100) / 100)); }

  function resize() {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bed = null;
    bedCtx = null;
  }

  function ensure() {
    if (!canvas.isConnected) document.body.appendChild(canvas);
    if (!w) resize();
    if (!raf) {
      last = 0;
      raf = requestAnimationFrame(loop);
    }
  }

  function stop() {
    state.kind = "";
    state.progress = 0;
    state.appear = 0;
    state.t = 0;
    bits = [];
    bed = null;
    bedCtx = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (canvas.isConnected) {
      ctx.clearRect(0, 0, w, h);
      canvas.remove();
    }
  }

  function apply(opts) {
    opts = opts || {};
    const kind = String(opts.kind || "");
    if (!kind) return stop();
    const same = state.kind === kind;
    state.kind = kind;
    if (opts.power != null) state.power = clamp(Math.round(Number(opts.power) || 50), 1, 100);
    if (opts.speed != null) state.speed = clamp(Math.round(Number(opts.speed) || 40), 1, 100);
    if (/^#[0-9a-fA-F]{6}$/.test(opts.hand || "")) state.hand = opts.hand;
    if (/^#[0-9a-fA-F]{6}$/.test(opts.face || "")) state.face = opts.face;
    if (opts.storm != null) state.storm = !!opts.storm;
    if (!same || opts.reset) {
      state.progress = 0;
      state.appear = 0;
      state.t = 0;
      bits = [];
      bed = null;
      bedCtx = null;
    }
    ensure();
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!state.kind) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    state.t += dt;
    state.progress = Math.min(1, state.progress + rate() * dt);
    state.appear = Math.min(1, state.appear + dt / 0.85);
    if (!w) resize();
    ctx.clearRect(0, 0, w, h);
    if (state.kind === "sand") drawSand(dt);
    else if (state.kind === "magic") drawMagic(dt);
    else if (state.kind === "smoke") drawSmoke(dt);
    else if (state.kind === "blizzard") drawBlizzard(dt);
    else if (state.kind === "fire") drawFire(dt);
    else if (state.kind === "flood") drawFlood(dt);
  }

  function drawSand(dt) {
    const p = state.progress;
    const appear = state.appear;
    const cx = w / 2;
    const cy = h / 2;
    const gw = Math.min(w * 0.36, 300);
    const gh = Math.min(h * 0.7, 520);
    ctx.fillStyle = "rgba(6, 8, 14, " + (0.28 * appear) + ")";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = appear;
    ctx.translate(cx, cy);
    function bulb(sign) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-gw * 0.12, sign * gh * 0.08, -gw * 0.46, sign * gh * 0.42);
      ctx.quadraticCurveTo(-gw * 0.52, sign * gh * 0.5, 0, sign * gh * 0.5);
      ctx.quadraticCurveTo(gw * 0.52, sign * gh * 0.5, gw * 0.46, sign * gh * 0.42);
      ctx.quadraticCurveTo(gw * 0.12, sign * gh * 0.08, 0, 0);
    }
    ctx.save();
    bulb(-1);
    ctx.clip();
    ctx.fillStyle = "#e4c57a";
    ctx.fillRect(-gw, -gh * 0.5, gw * 2, gh * 0.5 * (1 - p));
    ctx.restore();
    ctx.save();
    bulb(1);
    ctx.clip();
    ctx.fillStyle = "#c89a45";
    const pile = gh * 0.5 * p;
    ctx.fillRect(-gw, gh * 0.5 - pile, gw * 2, pile + 2);
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(230, 195, 106, 0.95)";
    bulb(-1);
    ctx.stroke();
    bulb(1);
    ctx.stroke();
    ctx.restore();
    const n = many(70);
    if (p > 0.02 && p < 0.98) {
      while (bits.length < n) {
        bits.push({ x: (Math.random() - 0.5) * 8, y: 0, v: 80 + Math.random() * 160, s: 1.2 + Math.random() * 2.2 });
      }
    }
    ctx.fillStyle = "#f0d48a";
    ctx.globalAlpha = appear;
    for (let i = bits.length - 1; i >= 0; i--) {
      const bit = bits[i];
      bit.y += bit.v * dt;
      ctx.beginPath();
      ctx.arc(cx + bit.x, cy - 8 + bit.y, bit.s, 0, Math.PI * 2);
      ctx.fill();
      if (bit.y > gh * 0.42 || p >= 0.98 || p <= 0.02) bits.splice(i, 1);
    }
    ctx.globalAlpha = 1;
  }

  function gearPath(r, teeth) {
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * Math.PI * 2;
      const a1 = a0 + Math.PI / teeth * 0.55;
      const a2 = a0 + Math.PI / teeth * 1.15;
      const a3 = a0 + (Math.PI * 2) / teeth;
      const outer = r * 1.18;
      if (i === 0) ctx.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
      else ctx.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
      ctx.lineTo(Math.cos(a1) * outer, Math.sin(a1) * outer);
      ctx.lineTo(Math.cos(a2) * outer, Math.sin(a2) * outer);
      ctx.lineTo(Math.cos(a3) * r, Math.sin(a3) * r);
    }
    ctx.closePath();
  }

  function drawGear(g) {
    ctx.save();
    ctx.translate(g.x * w, g.y * h);
    ctx.rotate(g.rot);
    ctx.globalAlpha = g.fade;
    ctx.fillStyle = g.ink;
    gearPath(g.r, g.teeth);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, g.r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = "#120e0b";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, g.r * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = g.ink;
    ctx.fill();
    ctx.restore();
  }

  function drawMagic(dt) {
    const n = many(42);
    const inks = ["#8a6a3a", "#b08a4a", "#6e5a48", "#c4a574", "#4e463c"];
    while (bits.length < n) {
      bits.push({
        x: 0.04 + Math.random() * 0.92,
        y: 0.04 + Math.random() * 0.92,
        r: 18 + Math.random() * 56,
        teeth: 6 + Math.floor(Math.random() * 6),
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.55),
        show: Math.random(),
        ink: inks[Math.floor(Math.random() * inks.length)]
      });
    }
    if (bits.length > n) bits.length = n;
    ctx.fillStyle = "rgba(8, 6, 10, " + (0.35 + state.progress * 0.45) + ")";
    ctx.fillRect(0, 0, w, h);
    bits.forEach(function (g) {
      g.rot += g.vr * dt;
      g.fade = clamp((state.progress - g.show) / 0.08, 0, 1) * state.appear;
      if (g.fade > 0) drawGear(g);
    });
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.16;
    ctx.globalAlpha = state.appear;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.08, 0, Math.PI * 2);
    ctx.fillStyle = "#2a2118";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = state.face;
    ctx.fill();
    ctx.strokeStyle = state.hand;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * R * 0.82, Math.sin(a) * R * 0.82);
      ctx.lineTo(Math.cos(a) * R * 0.94, Math.sin(a) * R * 0.94);
      ctx.strokeStyle = state.hand;
      ctx.lineWidth = i % 3 === 0 ? 3 : 1.4;
      ctx.stroke();
    }
    const now = new Date();
    const sec = now.getSeconds() + now.getMilliseconds() / 1000;
    const minute = now.getMinutes() + sec / 60;
    const hour = (now.getHours() % 12) + minute / 60;
    function hand(angle, len, width) {
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(0, -len);
      ctx.strokeStyle = state.hand;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
    }
    hand((hour / 12) * Math.PI * 2, R * 0.5, 4);
    hand((minute / 60) * Math.PI * 2, R * 0.72, 2.5);
    hand((sec / 60) * Math.PI * 2, R * 0.82, 1.2);
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = state.hand;
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawSmoke(dt) {
    const n = many(90);
    const front = state.progress * h;
    while (bits.length < n) {
      bits.push({
        x: Math.random() * w,
        y: Math.random() * -h * 0.3,
        r: 16 + Math.random() * 48,
        v: 18 + Math.random() * 50,
        a: 0.08 + Math.random() * 0.2,
        drift: (Math.random() - 0.5) * 20
      });
    }
    if (bits.length > n) bits.length = n;
    const fog = ctx.createLinearGradient(0, 0, 0, Math.max(8, front));
    fog.addColorStop(0, "rgba(70, 68, 66, " + (0.15 + state.progress * 0.55) + ")");
    fog.addColorStop(1, "rgba(40, 38, 36, 0)");
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, w, front + 40);
    bits.forEach(function (puff) {
      puff.y += puff.v * dt * (0.45 + state.speed / 100);
      puff.x += puff.drift * dt;
      if (puff.y > front + 30 || puff.x < -40 || puff.x > w + 40) {
        puff.y = -20 - Math.random() * 40;
        puff.x = Math.random() * w;
      }
      ctx.beginPath();
      ctx.fillStyle = "rgba(180, 176, 170, " + puff.a * state.appear + ")";
      ctx.arc(puff.x, puff.y, puff.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function snowBed() {
    if (!bed || bed.width !== Math.max(1, Math.floor(w)) || bed.height !== Math.max(1, Math.floor(h))) {
      bed = document.createElement("canvas");
      bed.width = Math.max(1, Math.floor(w));
      bed.height = Math.max(1, Math.floor(h));
      bedCtx = bed.getContext("2d");
    }
    return bedCtx;
  }

  function drawBlizzard(dt) {
    const n = many(140);
    const cover = snowBed();
    while (bits.length < n) {
      bits.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 1.2 + Math.random() * 3.2,
        v: 40 + Math.random() * 110,
        wind: 20 + Math.random() * 80
      });
    }
    if (bits.length > n) bits.length = n;
    const floor = h * (1 - state.progress * 0.92);
    bits.forEach(function (flake) {
      flake.y += flake.v * dt;
      flake.x += flake.wind * dt * (0.4 + state.power / 120);
      if (flake.x > w) flake.x -= w;
      if (flake.y > floor) {
        cover.fillStyle = "rgba(255,255,255," + (0.35 + Math.random() * 0.5) + ")";
        cover.beginPath();
        cover.arc(flake.x, Math.min(h - 2, flake.y), flake.r + state.progress * 1.4, 0, Math.PI * 2);
        cover.fill();
        flake.y = -8;
        flake.x = Math.random() * w;
      }
    });
    ctx.drawImage(bed, 0, 0, w, h);
    ctx.fillStyle = "rgba(236, 242, 248, " + (state.progress * 0.42) + ")";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    bits.forEach(function (flake) {
      ctx.globalAlpha = 0.75 * state.appear;
      ctx.beginPath();
      ctx.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawFire(dt) {
    if (!bits.length || bits._w !== w || bits._h !== h) {
      const cols = 16;
      const rows = 10;
      const origins = [[0.08, 0.08], [0.5, 0.86], [0.9, 0.32], [0.3, 0.5], [0.72, 0.14], [0.15, 0.78]];
      bits = [];
      bits._w = w;
      bits._h = h;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const px = (x + 0.5) / cols;
          const py = (y + 0.5) / rows;
          let best = 2;
          origins.forEach(function (spot) {
            const dist = Math.hypot(px - spot[0], py - spot[1]);
            if (dist < best) best = dist;
          });
          bits.push({
            x: px,
            y: py,
            gate: clamp(best / 0.72, 0, 0.98),
            phase: Math.random() * Math.PI * 2
          });
        }
      }
    }
    const flames = many(36);
    ctx.fillStyle = "rgba(20, 6, 0, " + (state.progress * 0.28) + ")";
    ctx.fillRect(0, 0, w, h);
    bits.forEach(function (cell) {
      if (state.progress < cell.gate) return;
      const heat = clamp((state.progress - cell.gate) / 0.12, 0, 1);
      const flick = 0.75 + Math.sin(state.t * 9 + cell.phase) * 0.25;
      const radius = (28 + state.power * 0.45) * heat * flick;
      const gx = cell.x * w;
      const gy = cell.y * h;
      const glow = ctx.createRadialGradient(gx, gy, 2, gx, gy, radius);
      glow.addColorStop(0, "rgba(255, 220, 120, " + (0.55 * heat) + ")");
      glow.addColorStop(0.45, "rgba(230, 90, 20, " + (0.35 * heat) + ")");
      glow.addColorStop(1, "rgba(120, 20, 0, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(gx, gy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 160, 40, " + (0.35 * heat) + ")";
      ctx.beginPath();
      ctx.moveTo(gx - 8, gy);
      ctx.quadraticCurveTo(gx - 4, gy - 18 * flick, gx, gy - 28 * flick * heat);
      ctx.quadraticCurveTo(gx + 6, gy - 16 * flick, gx + 8, gy);
      ctx.fill();
    });
    if (!bits._sparks) bits._sparks = [];
    const sparks = bits._sparks;
    while (sparks.length < flames) {
      sparks.push({ x: Math.random() * w, y: h, v: 40 + Math.random() * 80, life: Math.random() });
    }
    if (sparks.length > flames) sparks.length = flames;
    sparks.forEach(function (spark) {
      spark.y -= spark.v * dt;
      spark.life -= dt * 0.35;
      if (spark.life <= 0 || spark.y < h * (1 - state.progress) - 20) {
        spark.x = Math.random() * w;
        spark.y = h * (0.15 + Math.random() * 0.8);
        spark.life = 0.6 + Math.random();
      }
      ctx.fillStyle = "rgba(255, 190, 60, " + (spark.life * state.appear) + ")";
      ctx.fillRect(spark.x, spark.y, 2, 6);
    });
  }

  function drawFlood(dt) {
    const storm = state.storm;
    const level = h * (1 - state.progress);
    const amp = storm ? 16 + state.power * 0.12 : 6;
    const speed = storm ? 5.5 : 1.6;
    ctx.fillStyle = storm ? "rgba(8, 16, 28, " + (0.15 + state.progress * 0.35) + ")" : "rgba(8, 20, 28, " + (state.progress * 0.2) + ")";
    ctx.fillRect(0, 0, w, h);
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, level);
    const step = 16;
    for (let x = 0; x <= w; x += step) {
      const wave = Math.sin(x * 0.02 + state.t * speed) * amp + Math.sin(x * 0.011 - state.t * speed * 0.7) * amp * 0.45;
      ctx.lineTo(x, level + wave);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    const water = ctx.createLinearGradient(0, level, 0, h);
    if (storm) {
      water.addColorStop(0, "rgba(40, 90, 120, 0.55)");
      water.addColorStop(1, "rgba(6, 24, 48, 0.92)");
    } else {
      water.addColorStop(0, "rgba(70, 150, 170, 0.45)");
      water.addColorStop(1, "rgba(10, 50, 70, 0.9)");
    }
    ctx.fillStyle = water;
    ctx.fill();
    if (!storm) return;
    const n = many(120);
    while (bits.length < n) {
      bits.push({
        x: Math.random() * w,
        y: Math.random() * h,
        len: 12 + Math.random() * 18,
        v: 380 + Math.random() * 420
      });
    }
    if (bits.length > n) bits.length = n;
    ctx.strokeStyle = "rgba(180, 210, 230, 0.45)";
    ctx.lineWidth = 1.4;
    bits.forEach(function (drop) {
      drop.y += drop.v * dt;
      drop.x += drop.v * dt * 0.35;
      if (drop.y > level || drop.x > w + 20) {
        drop.y = -20;
        drop.x = Math.random() * w;
      }
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x + drop.len * 0.35, drop.y + drop.len);
      ctx.stroke();
    });
  }

  window.addEventListener("resize", function () {
    if (canvas.isConnected) resize();
  });

  window.ShirmoFx = {
    play: function (opts) { apply(opts); },
    tune: function (opts) {
      if (!state.kind) return;
      apply(Object.assign({ kind: state.kind, reset: false }, opts));
    },
    stop: stop,
    read: function () {
      return {
        kind: state.kind,
        power: state.power,
        speed: state.speed,
        hand: state.hand,
        face: state.face,
        storm: state.storm,
        progress: state.progress
      };
    }
  };
})();
