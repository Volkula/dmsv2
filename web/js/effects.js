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
    linked: false,
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
    if (opts.linked != null) state.linked = !!opts.linked;
    if (!same || opts.reset) {
      state.progress = 0;
      state.appear = 0;
      state.t = 0;
      bits = [];
      bed = null;
      bedCtx = null;
    }
    if (state.linked && opts.progress != null && Number.isFinite(Number(opts.progress))) {
      state.progress = clamp(Number(opts.progress), 0, 1);
    }
    ensure();
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!state.kind) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    state.t += dt;
    if (!state.linked) state.progress = Math.min(1, state.progress + rate() * dt);
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

  function puff(x, y, r, alpha, gray) {
    const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
    g.addColorStop(0, "rgba(" + gray + "," + gray + "," + (gray - 4) + "," + alpha + ")");
    g.addColorStop(0.45, "rgba(" + (gray - 18) + "," + (gray - 16) + "," + (gray - 14) + "," + (alpha * 0.45) + ")");
    g.addColorStop(1, "rgba(40, 38, 36, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSmoke(dt) {
    const p = state.progress;
    const n = many(80);
    const front = Math.max(8, p * h);
    while (bits.length < n) {
      bits.push({
        x: Math.random() * w,
        y: Math.random() * -h * 0.4,
        r: 50 + Math.random() * 140,
        v: 12 + Math.random() * 36,
        a: 0.05 + Math.random() * 0.1,
        gray: 150 + Math.floor(Math.random() * 40),
        wobble: Math.random() * Math.PI * 2,
        drift: 8 + Math.random() * 22
      });
    }
    if (bits.length > n) bits.length = n;
    const fog = ctx.createLinearGradient(0, 0, 0, front + 120);
    fog.addColorStop(0, "rgba(22, 20, 18, " + (0.45 + p * 0.4) + ")");
    fog.addColorStop(0.55, "rgba(70, 66, 60, " + (0.28 + p * 0.35) + ")");
    fog.addColorStop(1, "rgba(120, 116, 110, 0)");
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, w, front + 120);
    bits.forEach(function (blob) {
      blob.wobble += dt * 0.7;
      blob.y += blob.v * dt * (0.55 + state.speed / 140);
      blob.x += Math.sin(blob.wobble) * blob.drift * dt;
      if (blob.y > front + blob.r * 0.3 || blob.x < -blob.r || blob.x > w + blob.r) {
        blob.y = -blob.r;
        blob.x = Math.random() * w;
      }
      const depth = clamp(1 - blob.y / (front + 40), 0.25, 1);
      puff(blob.x, blob.y, blob.r * (0.8 + p * 0.5), blob.a * depth * state.appear * (0.7 + state.power / 180), blob.gray);
    });
    const band = ctx.createLinearGradient(0, Math.max(0, front - 70), 0, front + 50);
    band.addColorStop(0, "rgba(0,0,0,0)");
    band.addColorStop(0.5, "rgba(180, 176, 168, " + (0.08 + p * 0.12) + ")");
    band.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, w, front + 50);
  }

  function drawFire(dt) {
    const p = state.progress;
    const tongues = many(56);
    const base = h * (1 - p);
    ctx.fillStyle = "rgba(30, 6, 0, " + (0.12 + p * 0.5) + ")";
    ctx.fillRect(0, base, w, h - base);
    const wash = ctx.createLinearGradient(0, base - 30, 0, h);
    wash.addColorStop(0, "rgba(255, 90, 0, 0)");
    wash.addColorStop(0.25, "rgba(255, 70, 0, " + (0.18 + p * 0.25) + ")");
    wash.addColorStop(1, "rgba(90, 8, 0, " + (0.45 + p * 0.4) + ")");
    ctx.fillStyle = wash;
    ctx.fillRect(0, Math.max(0, base - 40), w, h);
    while (bits.length < tongues) {
      bits.push({
        x: Math.random(),
        gate: Math.random(),
        phase: Math.random() * Math.PI * 2,
        width: 16 + Math.random() * 42,
        height: 50 + Math.random() * 120,
        lean: (Math.random() - 0.5) * 40
      });
    }
    if (bits.length > tongues) bits.length = tongues;
    bits.forEach(function (tongue) {
      if (p < tongue.gate * 0.92) return;
      const life = clamp((p - tongue.gate * 0.92) / 0.12, 0, 1);
      tongue.phase += dt * 8;
      const flick = 0.72 + Math.sin(tongue.phase) * 0.28;
      const x = tongue.x * w;
      const rise = tongue.height * (0.45 + p * 0.7) * flick * life;
      const top = base - rise;
      const lean = tongue.lean * flick;
      const flame = ctx.createLinearGradient(x, top, x, base + 16);
      flame.addColorStop(0, "rgba(255, 250, 220, 0)");
      flame.addColorStop(0.18, "rgba(255, 236, 170, " + (0.9 * life) + ")");
      flame.addColorStop(0.42, "rgba(255, 140, 30, " + (0.75 * life) + ")");
      flame.addColorStop(0.72, "rgba(220, 40, 0, " + (0.45 * life) + ")");
      flame.addColorStop(1, "rgba(80, 0, 0, 0)");
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(x - tongue.width * 0.55, base + 6);
      ctx.quadraticCurveTo(x - tongue.width * 0.15 + lean * 0.3, base - rise * 0.45, x + lean * 0.35, top);
      ctx.quadraticCurveTo(x + tongue.width * 0.2 + lean, base - rise * 0.5, x + tongue.width * 0.6, base + 6);
      ctx.closePath();
      ctx.fill();
    });
    const embers = many(40);
    if (!bits._embers) bits._embers = [];
    const sparks = bits._embers;
    while (sparks.length < embers) {
      sparks.push({ x: Math.random() * w, y: h, v: 30 + Math.random() * 90, life: Math.random(), drift: (Math.random() - 0.5) * 20 });
    }
    if (sparks.length > embers) sparks.length = embers;
    sparks.forEach(function (spark) {
      spark.y -= spark.v * dt;
      spark.x += spark.drift * dt;
      spark.life -= dt * 0.25;
      if (spark.life <= 0 || spark.y < base - 80) {
        spark.x = Math.random() * w;
        spark.y = base + Math.random() * Math.max(8, h - base);
        spark.life = 0.5 + Math.random() * 1.2;
      }
      ctx.fillStyle = "rgba(255, " + Math.floor(160 + spark.life * 80) + ", 60, " + (spark.life * 0.8) + ")";
      ctx.fillRect(spark.x, spark.y, 2.2, 2.2);
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
    sync: function (opts) { apply(opts || {}); },
    setProgress: function (value) {
      if (!state.kind || !state.linked) return;
      state.progress = clamp(Number(value) || 0, 0, 1);
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
