/* The Atlas's map, moved about (ui-pudl#184; ui-pudl's bcn-atlas.js, without its windows). The
   server draws the whole map as SVG, each place a link to its tag's page and each pin to its post
   or factoid; without this script it's a picture with links in it. This adds:

     zoom      the wheel, a pinch, or the + and − buttons; "Whole map" frames everything
     pan       dragging the map (a drag never follows the link it started on)
     find      the "Find a place" form frames the place and focuses it, without a reload; a name
               that isn't on the map is left to the server, which says so
     focus     tabbing to a place brings it into view
     names     region names never overlap: placed biggest region first at each zoom, a name that
               would overlap one already placed is hidden until zooming in makes room
     pins      the framed or pointed-at place's pins show close up; every place's closer still
     new       What's new's "at <place>" links frame the place on the map instead of loading it

   Labels keep their size in pixels: --u on the SVG is one screen pixel in world units, and
   data-zoom (far, mid, near) says how many names show. Loaded on every page; it does nothing where
   there's no map, and starts again when a client-side navigation brings one. */
import { eachPage } from "./each-page.ts";

const NEAR = 1.5, MID = 0.9, TINY = 0.3, CLOSE = 3; // pixels per world unit at which more shows
const MIN_K = 0.05, MAX_K = 6;

type Box = { x: number; y: number; w: number; h: number };
type Map = {
  svg: SVGSVGElement; box: Box; world: Box; drag: { x: number; y: number; box: Box } | null;
  pointers: Record<number, { x: number; y: number }>; pinch: { d: number; box: Box } | null; moved: boolean;
  declutteredAt?: number;
};
let map: Map | null = null;

function parseBox(s: string | null): Box | null {
  const n = (s || "").trim().split(/[\s,]+/).map(Number);
  return n.length === 4 && n.every(Number.isFinite) ? { x: n[0], y: n[1], w: n[2], h: n[3] } : null;
}

function start(force = false) {
  const svg = document.querySelector<SVGSVGElement>("[data-atlas] svg.atlas-map");
  if (!svg) { map = null; return; }
  if (map && map.svg === svg && !force) return;
  const box = parseBox(svg.getAttribute("viewBox"));
  if (!box) return;
  const world = parseBox(svg.getAttribute("data-world")) || box;
  map = { svg, box, world, drag: null, pointers: {}, pinch: null, moved: false };
  const atlas = svg.closest("[data-atlas]")!;
  const zoom = atlas.querySelector<HTMLElement>(".atlas-zoom");
  if (zoom) zoom.hidden = false;
  // On a phone the key would cover the map: it starts folded, a tap from open.
  const key = atlas.querySelector<HTMLDetailsElement>("details.atlas-key-box");
  if (key && !key.dataset.ready) {
    key.dataset.ready = "";
    if (svg.getBoundingClientRect().width <= 640) key.open = false;
  }
  apply();
}

/** Pixels per world unit, as the SVG fits its box ("meet"), and the box. */
function scale() {
  const r = map!.svg.getBoundingClientRect();
  return { k: Math.min(r.width / map!.box.w, r.height / map!.box.h) || 1, r };
}

function apply() {
  if (!map) return;
  const b = map.box;
  map.svg.setAttribute("viewBox", [b.x, b.y, b.w, b.h].map((v) => Math.round(v * 10) / 10).join(" "));
  const k = scale().k;
  map.svg.style.setProperty("--u", `${(1 / k).toFixed(3)}px`);
  map.svg.setAttribute("data-zoom", k >= NEAR ? "near" : k >= MID ? "mid" : "far");
  map.svg.toggleAttribute("data-tiny", k < TINY);
  map.svg.toggleAttribute("data-close", k >= CLOSE);
  declutter(k);
}

/** Two boxes overlap, with [pad] to spare. */
export function overlap(a: DOMRect | SVGRect, b: DOMRect | SVGRect, pad = 0): boolean {
  return a.x < b.x + b.width + pad && b.x < a.x + a.width + pad && a.y < b.y + b.height + pad && b.y < a.y + a.height + pad;
}

/* Region names keep their size on screen at any zoom, so whether two collide depends on the zoom.
   At each new zoom they're placed biggest region first, and a name that would overlap one already
   placed is left out (.crowded) until zooming in makes room. Panning moves them all alike, so it's
   skipped then. */
function declutter(k: number) {
  if (!map || map.declutteredAt === k) return;
  map.declutteredAt = k;
  const names = [...map.svg.querySelectorAll<SVGTextElement>(".region-name")];
  names.forEach((n) => n.classList.remove("crowded"));
  const shown = names.filter((n) => getComputedStyle(n).display !== "none");
  shown.sort((a, b) => (+(b.getAttribute("data-size") || 0)) - (+(a.getAttribute("data-size") || 0)));
  const placed: SVGRect[] = [], pad = 4 / k;
  for (const n of shown) {
    const b = n.getBBox();
    if (placed.some((p) => overlap(b, p, pad))) n.classList.add("crowded");
    else placed.push(b);
  }
}

/** The world point under a screen point. */
function toWorld(cx: number, cy: number) {
  const s = scale(), r = s.r;
  // "meet" centres the box: the slack is split either side.
  const ox = (r.width - map!.box.w * s.k) / 2, oy = (r.height - map!.box.h * s.k) / 2;
  return { x: map!.box.x + (cx - r.left - ox) / s.k, y: map!.box.y + (cy - r.top - oy) / s.k, k: s.k };
}

/** Zooms by [f] about the screen point (cx, cy). */
function zoomAt(f: number, cx: number, cy: number) {
  const p = toWorld(cx, cy), k = Math.max(MIN_K, Math.min(MAX_K, p.k * f));
  const g = p.k / k;
  const b = map!.box;
  map!.box = { x: p.x - (p.x - b.x) * g, y: p.y - (p.y - b.y) * g, w: b.w * g, h: b.h * g };
  apply();
}

/** A box of the world at the current aspect, centred on (x, y), at [k] pixels a unit. */
function boxAt(x: number, y: number, k: number): Box {
  const r = map!.svg.getBoundingClientRect();
  const w = r.width / k, h = r.height / k;
  return { x: x - w / 2, y: y - h / 2, w, h };
}

function fly(to: Box) {
  if (!map) return;
  const from = map.box, t0 = performance.now(), svg = map.svg;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { map.box = to; apply(); return; }
  const step = (t: number) => {
    if (!map || map.svg !== svg) return;
    const p = Math.min(1, (t - t0) / 450), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    map.box = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e };
    apply();
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function placeEl(tag: string | null): SVGAElement | null {
  const want = (tag || "").trim().toLowerCase();
  if (!want || !map) return null;
  for (const a of map.svg.querySelectorAll<SVGAElement>("a.place[data-tag]")) {
    if (a.getAttribute("data-tag")!.toLowerCase() === want) return a;
  }
  return null;
}

const at = (el: Element) => ({ x: parseFloat(el.getAttribute("data-x")!), y: parseFloat(el.getAttribute("data-y")!) });

/** Marks the place [tag] as the one in hand: named, and its pins shown close up. */
function here(tag: string) {
  if (!map) return;
  map.svg.querySelectorAll(".here").forEach((h) => h.classList.remove("here"));
  placeEl(tag)?.classList.add("here");
  map.svg.querySelector(`g.pins[data-for="${CSS.escape(tag)}"]`)?.classList.add("here");
}

/** Pointing at a place shows its pins, and they stay while the pointer is on them. */
function shown(tag: string | null) {
  if (!map) return;
  map.svg.querySelectorAll("g.pins.shown").forEach((g) => { if (g.getAttribute("data-for") !== tag) g.classList.remove("shown"); });
  if (tag) map.svg.querySelector(`g.pins[data-for="${CSS.escape(tag)}"]`)?.classList.add("shown");
}

/** Frames a place close up and marks it as the one asked for. */
function frame(el: Element) {
  const p = at(el);
  here(el.getAttribute("data-tag")!);
  fly(boxAt(p.x, p.y, Math.max(scale().k, 1.6)));
}

/** The address says which place is framed, so a reload or a shared link frames it too. */
function remember(tag: string) {
  const url = new URL(location.href);
  url.searchParams.set("at", tag);
  history.replaceState(history.state, "", url);
}

const inMap = (e: Event) => !!map && e.target instanceof Node && map.svg.contains(e.target);

/* --- zoom and pan ------------------------------------------------------------------------ */

document.addEventListener("wheel", (e) => {
  if (!inMap(e)) return;
  e.preventDefault();
  zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
}, { passive: false });

document.addEventListener("pointerdown", (e) => {
  if (!inMap(e) || e.button !== 0) return;
  const m = map!;
  m.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
  const ids = Object.keys(m.pointers);
  if (ids.length === 1) {
    m.moved = false;
    m.drag = { x: e.clientX, y: e.clientY, box: m.box };
  } else if (ids.length === 2) {
    const a = m.pointers[+ids[0]], b = m.pointers[+ids[1]];
    m.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), box: m.box };
    m.drag = null;
  }
});

document.addEventListener("pointerover", (e) => {
  if (!inMap(e) || (map!.drag && map!.moved)) return;
  const a = (e.target as Element).closest("a.place, a.pin");
  if (a) shown(a.getAttribute("data-tag"));
});

window.addEventListener("pointermove", (e) => {
  if (!map || !map.pointers[e.pointerId]) return;
  const m = map;
  m.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
  const ids = Object.keys(m.pointers);
  if (ids.length === 2 && m.pinch) {
    const a = m.pointers[+ids[0]], b = m.pointers[+ids[1]];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (m.pinch.d > 0 && d > 0) {
      const before = m.box;
      m.box = m.pinch.box;
      zoomAt(d / m.pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      if (!Number.isFinite(m.box.w)) m.box = before;
    }
    m.moved = true;
    return;
  }
  if (!m.drag) return;
  const dx = e.clientX - m.drag.x, dy = e.clientY - m.drag.y;
  if (!m.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
  if (!m.moved) { m.moved = true; m.svg.classList.add("dragging"); }
  const k = scale().k;
  m.box = { x: m.drag.box.x - dx / k, y: m.drag.box.y - dy / k, w: m.drag.box.w, h: m.drag.box.h };
  apply();
});

function release(e: PointerEvent) {
  if (!map || !map.pointers[e.pointerId]) return;
  delete map.pointers[e.pointerId];
  if (Object.keys(map.pointers).length < 2) map.pinch = null;
  if (!Object.keys(map.pointers).length) { map.drag = null; map.svg.classList.remove("dragging"); }
}
window.addEventListener("pointerup", release);
window.addEventListener("pointercancel", release);

/* The zoom buttons; a drag that ends on a place doesn't follow it; a click marks it. */
document.addEventListener("click", (e) => {
  if (!map) return;
  const target = e.target as Element;
  const zoom = target.closest?.("[data-atlas-zoom]");
  if (zoom && map.svg.closest("[data-atlas]")!.contains(zoom)) {
    const r = map.svg.getBoundingClientRect(), how = zoom.getAttribute("data-atlas-zoom");
    if (how === "fit") fly(map.world);
    else zoomAt(how === "in" ? 1.6 : 1 / 1.6, r.left + r.width / 2, r.top + r.height / 2);
    return;
  }
  if (!inMap(e)) return;
  if (map.moved) {
    map.moved = false;
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  const place = target.closest("a.place");
  if (place) here(place.getAttribute("data-tag")!);
}, true);

/* Tabbing to a place off screen brings it into view. */
document.addEventListener("focusin", (e) => {
  if (!inMap(e)) return;
  const el = (e.target as Element).closest("a.place");
  if (!el) return;
  const pr = el.getBoundingClientRect(), r = map!.svg.getBoundingClientRect();
  if (pr.left < r.left || pr.right > r.right || pr.top < r.top || pr.bottom > r.bottom) {
    const p = at(el);
    fly(boxAt(p.x, p.y, Math.max(scale().k, MID)));
  }
});

/* --- find ------------------------------------------------------------------------------ */

// On the window, before Primate's own submit listener (which draws the page again in place).
window.addEventListener("submit", (e) => {
  const form = e.target as HTMLFormElement;
  if (!map || !form.classList?.contains("atlas-find")) return;
  const el = placeEl(String(new FormData(form).get("at") || ""));
  if (!el) return; // the server says no place is called that
  e.preventDefault();
  e.stopPropagation();
  frame(el);
  remember(el.getAttribute("data-tag")!);
  form.closest("[data-atlas]")?.querySelector(".atlas-missed")?.remove();
  el.focus({ preventScroll: true });
}, true);

/* What's new's places: framed in place, the address saying which. */
window.addEventListener("click", (e) => {
  if (!map || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element).closest?.("a[data-atlas-frame]");
  const el = a && placeEl(a.getAttribute("data-atlas-frame"));
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  frame(el);
  remember(el.getAttribute("data-tag")!);
  map.svg.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}, true);

eachPage(() => start());
// A client-side navigation to the Atlas from the Atlas (a name the map hasn't, say) may keep the
// same SVG with a new view.
window.addEventListener("primate:navigation-end", () => start(true));
window.addEventListener("resize", () => { if (map) { map.declutteredAt = undefined; apply(); } });
