(function () {
  function along(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  function withAlpha(color, alpha) {
    const byte = Math.max(0, Math.min(255, Math.round(alpha * 255))).toString(16).padStart(2, "0");
    return color + byte;
  }

  function blocksOf(wall) {
    const list = [];
    const points = wall.points || [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const gaps = (wall.openings || []).filter(function (op) {
        return op.seg === i && op.open !== false;
      }).map(function (op) {
        const half = (op.span || 40) / 2 / len;
        return [Math.max(0, op.t - half), Math.min(1, op.t + half)];
      }).sort(function (p, q) { return p[0] - q[0]; });
      let cursor = 0;
      gaps.forEach(function (gap) {
        if (gap[0] > cursor + 0.002) {
          const p = along(a, b, cursor);
          const q = along(a, b, gap[0]);
          list.push({ x1: p[0], y1: p[1], x2: q[0], y2: q[1] });
        }
        cursor = Math.max(cursor, gap[1]);
      });
      if (cursor < 0.998) {
        const p = along(a, b, cursor);
        list.push({ x1: p[0], y1: p[1], x2: b[0], y2: b[1] });
      }
    }
    return list;
  }

  function segmentsFor(project, level) {
    const list = [];
    (project.walls || []).forEach(function (wall) {
      if (Number(wall.z) === level) blocksOf(wall).forEach(function (seg) { list.push(seg); });
    });
    (project.levels || []).forEach(function (area) {
      if (!(Number(area.z) > level) || !area.points || area.points.length < 3) return;
      for (let i = 0; i < area.points.length; i += 1) {
        const a = area.points[i];
        const b = area.points[(i + 1) % area.points.length];
        list.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
      }
    });
    return list;
  }

  function rayHit(ox, oy, angle, maxDist, segments) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let best = maxDist;
    segments.forEach(function (seg) {
      const sx = seg.x2 - seg.x1;
      const sy = seg.y2 - seg.y1;
      const denom = dx * sy - dy * sx;
      if (Math.abs(denom) < 1e-8) return;
      const qpx = seg.x1 - ox;
      const qpy = seg.y1 - oy;
      const t = (qpx * sy - qpy * sx) / denom;
      const u = (qpx * dy - qpy * dx) / denom;
      if (t > 0.5 && u >= 0 && u <= 1 && t < best) best = t;
    });
    return best;
  }

  function sight(project, x, y, level, maxDist) {
    const segments = segmentsFor(project, level);
    const angles = [];
    const steps = 180;
    for (let i = 0; i < steps; i += 1) angles.push((i / steps) * Math.PI * 2);
    segments.forEach(function (seg) {
      [[seg.x1, seg.y1], [seg.x2, seg.y2]].forEach(function (point) {
        if (Math.hypot(point[0] - x, point[1] - y) > maxDist * 1.5) return;
        const angle = Math.atan2(point[1] - y, point[0] - x);
        angles.push(angle - 1e-4, angle, angle + 1e-4);
      });
    });
    const ordered = angles
      .map(function (angle) { return ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); })
      .sort(function (a, b) { return a - b; });
    const points = [];
    let last = -1;
    ordered.forEach(function (angle) {
      if (angle - last < 1e-5) return;
      last = angle;
      const dist = rayHit(x, y, angle, maxDist, segments);
      points.push([x + Math.cos(angle) * dist, y + Math.sin(angle) * dist]);
    });
    return points;
  }

  function trace(g, points, close) {
    g.beginPath();
    points.forEach(function (p, index) {
      if (index) g.lineTo(p[0], p[1]);
      else g.moveTo(p[0], p[1]);
    });
    if (close) g.closePath();
  }

  function skyOf(project) {
    const sky = project.sky || {};
    const body = sky.body === "sun" ? "sun" : "moon";
    let power = sky.power == null ? (project.shade == null ? 0.55 : Number(project.shade)) : Number(sky.power);
    if (!isFinite(power)) power = 0.55;
    power = Math.max(0, Math.min(1, power));
    if (body === "sun") return { dark: (1 - power) * 0.22, tint: "#ffd7a1", tintA: 0.1 * power };
    return { dark: 0.22 + power * 0.58, tint: "#9eb6dc", tintA: 0.1 * power };
  }

  function paintLamp(g, project, x, y, level, maxDist, color, tint, dot) {
    const poly = sight(project, x, y, Number(level) || 0, maxDist * 1.05);
    if (poly.length < 3) return;
    g.save();
    trace(g, poly, true);
    g.clip();
    g.globalCompositeOperation = "destination-out";
    const fade = g.createRadialGradient(x, y, 0, x, y, maxDist);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(0.18, "rgba(0,0,0,0.94)");
    fade.addColorStop(0.46, "rgba(0,0,0,0.55)");
    fade.addColorStop(0.78, "rgba(0,0,0,0.16)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = fade;
    g.fillRect(x - maxDist, y - maxDist, maxDist * 2, maxDist * 2);
    g.globalCompositeOperation = "source-over";
    const warm = g.createRadialGradient(x, y, 0, x, y, maxDist);
    warm.addColorStop(0, withAlpha(color, 0.42 * tint));
    warm.addColorStop(0.38, withAlpha(color, 0.14 * tint));
    warm.addColorStop(1, withAlpha(color, 0));
    g.fillStyle = warm;
    g.fillRect(x - maxDist, y - maxDist, maxDist * 2, maxDist * 2);
    if (dot !== false) {
      const coreReach = Math.max(16, maxDist * 0.07);
      const core = g.createRadialGradient(x, y, 0, x, y, coreReach);
      core.addColorStop(0, withAlpha("#fff6e4", 0.7 * tint));
      core.addColorStop(1, withAlpha("#fff6e4", 0));
      g.fillStyle = core;
      g.beginPath();
      g.arc(x, y, coreReach, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  function openingAt(wall, op) {
    const points = wall.points || [];
    const a = points[op.seg];
    const b = points[op.seg + 1];
    if (!a || !b) return null;
    const p = along(a, b, Number(op.t) || 0);
    return { x: p[0], y: p[1], dx: b[0] - a[0], dy: b[1] - a[1], span: op.span || 40 };
  }

  function drawOpening(g, wall, op) {
    const spot = openingAt(wall, op);
    if (!spot) return;
    const len = Math.hypot(spot.dx, spot.dy) || 1;
    const ux = spot.dx / len;
    const uy = spot.dy / len;
    const half = spot.span / 2;
    g.lineCap = "round";
    g.strokeStyle = op.open === false ? (op.kind === "window" ? "#b9cbe2" : "#d7b56a") : (op.kind === "window" ? "#d5e7ff" : "#e7c27a");
    g.lineWidth = Math.max(3, (wall.width || 8) * (op.open === false ? 0.72 : 0.4));
    g.beginPath();
    g.moveTo(spot.x - ux * half, spot.y - uy * half);
    g.lineTo(spot.x + ux * half * (op.open === false || op.kind === "window" ? 1 : 0), spot.y + uy * half * (op.open === false || op.kind === "window" ? 1 : 0));
    g.stroke();
  }

  function paint(canvas, project) {
    const g = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    g.clearRect(0, 0, width, height);
    if (!project) return;
    const sky = skyOf(project);
    g.fillStyle = "rgba(8, 11, 20, " + sky.dark + ")";
    g.fillRect(0, 0, width, height);
    if (sky.tintA > 0.01) {
      g.fillStyle = withAlpha(sky.tint, sky.tintA);
      g.fillRect(0, 0, width, height);
    }
    (project.lights || []).forEach(function (light) {
      const color = /^#[0-9a-fA-F]{6}$/.test(light.color || "") ? light.color : "#ffc27a";
      paintLamp(g, project, light.x, light.y, light.z, light.radius || 320, color, 1, light.dot !== false);
    });
    if (project.eye) paintLamp(g, project, project.eye.x, project.eye.y, project.eye.z, project.eye.radius || 320, "#d5e2ff", 0.4, false);
    (project.walls || []).forEach(function (wall) {
      (wall.openings || []).forEach(function (op) { drawOpening(g, wall, op); });
    });
  }

  function hitOpening(project, x, y, pad) {
    let best = null;
    let bestD = pad || 18;
    (project.walls || []).forEach(function (wall, wi) {
      (wall.openings || []).forEach(function (op, oi) {
        const spot = openingAt(wall, op);
        if (!spot) return;
        const len = Math.hypot(spot.dx, spot.dy) || 1;
        const ux = spot.dx / len;
        const uy = spot.dy / len;
        const half = spot.span / 2;
        const ax = spot.x - ux * half;
        const ay = spot.y - uy * half;
        const bx = spot.x + ux * half;
        const by = spot.y + uy * half;
        const dx = bx - ax;
        const dy = by - ay;
        const span = dx * dx + dy * dy || 1;
        let t = ((x - ax) * dx + (y - ay) * dy) / span;
        t = Math.max(0, Math.min(1, t));
        const dist = Math.hypot(ax + dx * t - x, ay + dy * t - y);
        if (dist < bestD) {
          bestD = dist;
          best = { wall: wi, index: oi };
        }
      });
    });
    return best;
  }

  window.VolkulaLight = { paint: paint, hitOpening: hitOpening };
})();
