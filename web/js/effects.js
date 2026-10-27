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
    until: 0,
    left: 0,
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
    state.until = 0;
    state.left = 0;
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
    if (opts.until != null) state.until = Math.max(0, Math.round(Number(opts.until) || 0));
    if (opts.left != null && Number.isFinite(Number(opts.left))) state.left = Math.max(0, Number(opts.left));
    ensure();
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!state.kind) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    state.t += dt;
    if (!state.linked) state.progress = Math.min(1, state.progress + rate() * dt);
    if (state.linked && state.until > 0) state.left = Math.max(0, state.until - Date.now());
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

  function drawMagic() {
    const leftMs = state.linked ? Math.max(0, state.left || 0) : state.t * 1000;
    const secLeft = (leftMs / 1000) % 60;
    const sec = state.linked ? (60 - secLeft) % 60 : secLeft;
    const minute = (leftMs / 60000) % 60;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.26;
    ctx.save();
    ctx.globalAlpha = state.appear;
    ctx.fillStyle = "rgba(6, 5, 4, " + (0.32 + state.progress * 0.28) + ")";
    ctx.fillRect(0, 0, w, h);
    ctx.beginPath();
    ctx.arc(cx, cy + 3, R * 1.22, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();
    const bezel = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.2, cx, cy, R * 1.18);
    bezel.addColorStop(0, "#f6e7b8");
    bezel.addColorStop(0.42, "#c6a25c");
    bezel.addColorStop(0.72, "#8a6830");
    bezel.addColorStop(1, "#3e2a14");
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.14, 0, Math.PI * 2);
    ctx.fillStyle = bezel;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.98, 0, Math.PI * 2);
    ctx.fillStyle = state.face;
    ctx.fill();
    const shade = ctx.createRadialGradient(cx, cy - R * 0.15, R * 0.1, cx, cy, R);
    shade.addColorStop(0, "rgba(255,255,255,0.14)");
    shade.addColorStop(1, "rgba(0,0,0,0.32)");
    ctx.fillStyle = shade;
    ctx.fill();
    ctx.translate(cx, cy);
    ctx.strokeStyle = state.hand;
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
      const inner = i % 5 === 0 ? R * 0.78 : R * 0.86;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92);
      ctx.lineWidth = i % 5 === 0 ? 2.6 : 1;
      ctx.stroke();
    }
    ctx.font = "600 " + Math.round(R * 0.14) + "px Georgia, serif";
    ctx.fillStyle = state.hand;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let n = 1; n <= 12; n++) {
      const a = (n / 12) * Math.PI * 2 - Math.PI / 2;
      ctx.fillText(String(n), Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62 + 1);
    }
    const remainFrac = state.linked ? clamp(1 - state.progress, 0, 1) : (sec / 60);
    ctx.beginPath();
    ctx.strokeStyle = "#e6c36a";
    ctx.lineWidth = Math.max(3, R * 0.025);
    ctx.lineCap = "round";
    ctx.arc(0, 0, R * 0.99, -Math.PI / 2, -Math.PI / 2 + remainFrac * Math.PI * 2);
    ctx.stroke();
    function leaf(angle, len, width) {
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, width * 1.4);
      ctx.quadraticCurveTo(width, 0, 0, -len);
      ctx.quadraticCurveTo(-width, 0, 0, width * 1.4);
      ctx.closePath();
      ctx.fillStyle = state.hand;
      ctx.fill();
      ctx.restore();
    }
    leaf((minute / 60) * Math.PI * 2, R * 0.5, R * 0.04);
    ctx.save();
    ctx.rotate((sec / 60) * Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(0, R * 0.18);
    ctx.lineTo(0, -R * 0.76);
    ctx.strokeStyle = "#8d2a22";
    ctx.lineWidth = Math.max(1.4, R * 0.012);
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, R * 0.22, R * 0.045, 0, Math.PI * 2);
    ctx.fillStyle = "#8d2a22";
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.04, 0, Math.PI * 2);
    ctx.fillStyle = "#e6c36a";
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#c4a15a";
    ctx.beginPath();
    ctx.roundRect(cx + R * 1.08, cy - R * 0.09, R * 0.14, R * 0.18, 3);
    ctx.fill();
    ctx.strokeStyle = "#6a4e22";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = cy - R * 0.06 + i * R * 0.04;
      ctx.beginPath();
      ctx.moveTo(cx + R * 1.09, y);
      ctx.lineTo(cx + R * 1.2, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
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
    setLeft: function (value) {
      if (!state.kind) return;
      state.left = Math.max(0, Number(value) || 0);
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
