function blankView(id) {
  return {
    id: id,
    name: "Вид 1",
    day: "",
    night: "",
    mode: "day",
    locations: [],
    markers: [],
    labels: [],
    strokes: []
  };
}

export function blankCampaign(pageId) {
  const viewId = pageId + "-view";
  return {
    stage: { width: 1368, height: 786 },
    activePageId: pageId,
    shownPageId: pageId,
    library: { fonts: [], images: [], notes: [] },
    pages: [
      {
        id: pageId,
        name: "Сцена 1",
        kind: "note",
        title: "",
        text: "",
        color: "#16130f",
        ink: "#f3ead8",
        size: 64,
        font: "Georgia, serif",
        fontUrl: "",
        image: ""
      },
      {
        id: pageId + "-map",
        name: "Карта",
        kind: "map",
        views: [blankView(viewId)],
        activeViewId: viewId
      }
    ]
  };
}

function unit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function clip(value, size) {
  return String(value || "").slice(0, size);
}

function projectMap(page) {
  const views = Array.isArray(page.views) ? page.views : [];
  const view = views.find(function (item) { return item.id === page.activeViewId; }) || views[0] || {};
  const night = view.mode === "night";
  const image = night && view.night ? view.night : (view.day || "");
  const locations = (Array.isArray(view.locations) ? view.locations : []).filter(function (item) {
    return item && !item.hidden;
  }).slice(0, 200).map(function (item) {
    return { id: clip(item.id, 80), name: clip(item.name, 80), x: unit(item.x), y: unit(item.y), tip: clip(item.tip, 400) };
  });
  const markers = (Array.isArray(view.markers) ? view.markers : []).filter(function (item) {
    return item && !item.hidden;
  }).slice(0, 200).map(function (item) {
    return {
      id: clip(item.id, 80),
      name: clip(item.name, 80),
      x: unit(item.x),
      y: unit(item.y),
      kind: item.kind === "npc" ? "npc" : "mark",
      tip: clip(item.tip, 400)
    };
  });
  const labels = (Array.isArray(view.labels) ? view.labels : []).slice(0, 100).map(function (item) {
    return {
      id: clip(item.id, 80),
      text: clip(item.text, 200),
      x: unit(item.x),
      y: unit(item.y),
      font: clip(item.font, 120) || "Georgia, serif",
      fontUrl: clip(item.fontUrl, 300),
      size: Math.min(120, Math.max(12, Number(item.size) || 28)),
      ink: clip(item.ink, 20) || "#f3ead8",
      bold: !!item.bold,
      italic: !!item.italic,
      underline: !!item.underline
    };
  });
  const strokes = (Array.isArray(view.strokes) ? view.strokes : []).slice(-80).map(function (item) {
    const tool = item && (item.tool === "line" || item.tool === "rect" || item.tool === "ellipse") ? item.tool : "brush";
    return {
      tool: tool,
      color: clip(item && item.color, 20) || "#e6c36a",
      width: Math.min(40, Math.max(1, Number(item && item.width) || 3)),
      points: (item && Array.isArray(item.points) ? item.points : []).slice(0, 500).map(function (point) {
        return { x: unit(point.x), y: unit(point.y) };
      })
    };
  });
  return {
    id: page.id,
    name: view.name || page.name || "Карта",
    kind: "map",
    day: clip(image, 300),
    night: "",
    mode: night && !view.night ? "night" : "day",
    locations: locations,
    markers: markers,
    labels: labels,
    strokes: strokes
  };
}

function projectNote(page) {
  return {
    id: page.id,
    name: page.name || "",
    kind: page.kind || "note",
    title: page.title || "",
    text: page.text || "",
    color: page.color || "#16130f",
    ink: page.ink || "#f3ead8",
    size: Number(page.size) || 64,
    font: page.font || "Georgia, serif",
    fontUrl: page.fontUrl || "",
    image: page.image || ""
  };
}

export function projectFrame(campaign) {
  const pages = Array.isArray(campaign.pages) ? campaign.pages : [];
  const page = pages.find(function (item) { return item.id === campaign.shownPageId; }) || pages[0] || null;
  return {
    stage: campaign.stage || { width: 1368, height: 786 },
    page: page ? (page.kind === "map" ? projectMap(page) : projectNote(page)) : null,
    at: Date.now()
  };
}

export function campaignOk(value) {
  if (!value || typeof value !== "object") return false;
  if (!value.stage || !Array.isArray(value.pages) || !value.pages.length) return false;
  if (!value.pages.every(function (page) { return page && typeof page.id === "string"; })) return false;
  return true;
}
