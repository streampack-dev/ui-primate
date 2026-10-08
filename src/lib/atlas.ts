/* The Atlas (ui-pudl#184): a map of the site's tags, laid out by the API (GET /atlas) so every front
   end draws the same geography. This draws it: each region and place where the API put it, at the
   size it gave, with its pins; and works out what's new since the reader's last visit.

   What's found at a place is told by shape, never by colour alone, as ui-pudl draws it: a disc for
   articles only, a ring for factoids only, a diamond for both; around it, a square for each article
   and a triangle for each factoid. A place holding something new has a dot, one holding only
   changes a small ring. Nothing here lays anything out: positions, radii and label sizes are the
   API's. */
import type { components } from "#api/schema.d.ts";
import { factoidHref } from "#lib/factoids.ts";
import { formatDate } from "#lib/format.ts";

type S = components["schemas"];
export type AtlasData = S["AtlasResponse"];
export type AtlasPlaceData = S["AtlasPlaceResponse"];
export type AtlasPinData = S["AtlasPin"];

export type Kind = "articles" | "factoids" | "shared";
export type Freshness = "new" | "changed";

/** Each kind of place: its shape, and what the legend says it means. */
export const KINDS: { kind: Kind; shape: string; legend: string }[] = [
  { kind: "articles", shape: "disc", legend: "Articles only" },
  { kind: "factoids", shape: "ring", legend: "Factoids only" },
  { kind: "shared", shape: "diamond", legend: "Articles and factoids" },
];

/** Each kind of pin, shown close up around its place. */
export const PIN_KINDS: { kind: "article" | "factoid"; shape: string; legend: string }[] = [
  { kind: "article", shape: "square", legend: "An article, close up" },
  { kind: "factoid", shape: "triangle", legend: "A factoid, close up" },
];

/** A view framed on one place: this many world units across and down. */
const FOCUS_W = 640;
const FOCUS_H = 440;
/** The map's width in pixels before script measures it, for the labels' first size. */
const STAGE_GUESS = 1100;
/** Pins are this many world units across. */
const PIN_SIZE = 7;

const n = (v: number) => String((Math.sign(v) * Math.round(Math.abs(v) * 10)) / 10 || 0);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export const tagHref = (tag: string) => `/tags/${encodeURIComponent(tag)}`;
export const atlasHref = (tag: string) => `/atlas?at=${encodeURIComponent(tag)}`;
const postHref = (slug: string) => `/posts/${slug}`;

/* --- the map ---------------------------------------------------------------------------- */

export type PinView = { kind: "article" | "factoid"; href: string; title: string; path: string; x: string; y: string };
export type PlaceView = {
  tag: string; href: string; kind: Kind; x: string; y: string; r: string; ringWidth: string; diamond: string;
  label: string; counts: string; fs: string; dy: string; minor: boolean; major: boolean; here: boolean;
  fresh: Freshness | null; badgeX: string; badgeY: string; glowR: string;
  pins: PinView[];
};
export type RegionView = {
  id: number; name: string; x: string; y: string; r: string; uncharted: boolean; labelY: string; size: number;
  small: boolean; lines: { text: string; dy: string }[]; places: PlaceView[];
};

/** How much is fresh at a place. */
export type FreshCount = { new: number; changed: number };

function counts(p: AtlasPlaceData): string {
  return [
    p.articleCount > 0 ? plural(Number(p.articleCount), "article") : "",
    p.factoidCount > 0 ? plural(Number(p.factoidCount), "factoid") : "",
  ].filter(Boolean).join(", ");
}

function freshWords(c: FreshCount): string {
  return [c.new > 0 ? `${c.new} new` : "", c.changed > 0 ? `${c.changed} changed` : ""].filter(Boolean).join(", ");
}

function pinPath(kind: string, x: number, y: number): string {
  const s = PIN_SIZE / 2;
  return kind === "article"
    ? `M${n(x - s)},${n(y - s)}H${n(x + s)}V${n(y + s)}H${n(x - s)}Z`
    : `M${n(x)},${n(y - s * 1.25)}L${n(x + s * 1.15)},${n(y + s * 0.85)}L${n(x - s * 1.15)},${n(y + s * 0.85)}Z`;
}

function pinView(pin: AtlasPinData): PinView | null {
  const href = pin.kind === "article" ? (pin.slug ? postHref(pin.slug) : null) : pin.selector ? factoidHref(pin.selector) : null;
  if (!href) return null;
  return { kind: pin.kind, href, title: `${pin.title} (${pin.kind})`, path: pinPath(pin.kind, pin.x, pin.y), x: n(pin.x), y: n(pin.y) };
}

function placeView(p: AtlasPlaceData, focus: string | null, fresh: FreshCount | undefined): PlaceView {
  const size = Number(p.articleCount) + Number(p.factoidCount);
  const d = p.r * 1.25;
  const label = `${p.tag}: ${counts(p)}${fresh ? `; ${freshWords(fresh)}` : ""}`;
  return {
    tag: p.tag,
    href: tagHref(p.tag),
    kind: p.kind as Kind,
    x: n(p.x), y: n(p.y), r: n(p.r),
    ringWidth: n(Math.max(2, p.r / 2.6)),
    diamond: `M${n(p.x)},${n(p.y - d)}L${n(p.x + d)},${n(p.y)}L${n(p.x)},${n(p.y + d)}L${n(p.x - d)},${n(p.y)}Z`,
    label,
    counts: counts(p),
    fs: n(p.labelSize),
    dy: n(-p.r - 4),
    minor: p.minor,
    major: !p.minor && size >= 8,
    here: focus === p.tag,
    fresh: fresh ? (fresh.new > 0 ? "new" : "changed") : null,
    badgeX: n(p.x + p.r * 0.95 + 3),
    badgeY: n(p.y - p.r * 0.95 - 3),
    glowR: n(p.r * 1.25 + 7),
    pins: (p.pins || []).map(pinView).filter((v): v is PinView => v !== null),
  };
}

/** The place called [tag] (ignoring case and spaces either side), if it's on the map. */
export function findPlace(atlas: AtlasData, tag: string | undefined): AtlasPlaceData | undefined {
  const want = (tag || "").trim().toLowerCase();
  return want ? atlas.places.find((p) => p.tag.toLowerCase() === want) : undefined;
}

/** The regions as they're drawn, each with its places, in the API's order. */
export function regionViews(atlas: AtlasData, focus: string | null, fresh: Map<string, FreshCount>): RegionView[] {
  return atlas.regions.map((region) => {
    const places = atlas.places.filter((p) => p.region === region.id).map((p) => placeView(p, focus, fresh.get(p.tag)));
    const lines = region.name.split(" · ");
    return {
      id: region.id, name: region.name, x: n(region.x), y: n(region.y), r: n(region.r), uncharted: region.uncharted,
      labelY: n(region.y - region.r - 14),
      size: places.length,
      small: places.length < 6,
      // A tag a line, the lines centred on the region's middle (ems).
      lines: lines.map((text, i) => ({ text, dy: i === 0 ? `${n(-0.6 * (lines.length - 1) + 0.35)}em` : "1.2em" })),
      places,
    };
  });
}

type Box = [number, number, number, number];
const boxText = (b: Box) => b.map(n).join(" ");

export function worldBox(atlas: AtlasData): Box {
  const b = atlas.bounds;
  return [b.x, b.y, b.width, b.height];
}

/** The first view: the place asked for; else the places holding something fresh, unless they span
   most of the map; else the whole map. */
export function viewBox(atlas: AtlasData, focus: AtlasPlaceData | undefined, freshTags: string[]): Box {
  const world = worldBox(atlas);
  if (focus) return [focus.x - FOCUS_W / 2, focus.y - FOCUS_H / 2, FOCUS_W, FOCUS_H];
  const fresh = atlas.places.filter((p) => freshTags.includes(p.tag));
  if (!fresh.length) return world;
  const pad = 80;
  let x0 = Math.min(...fresh.map((p) => p.x)) - pad, x1 = Math.max(...fresh.map((p) => p.x)) + pad;
  let y0 = Math.min(...fresh.map((p) => p.y)) - pad, y1 = Math.max(...fresh.map((p) => p.y)) + pad;
  if (x1 - x0 < FOCUS_W) { const g = (FOCUS_W - (x1 - x0)) / 2; x0 -= g; x1 += g; }
  if (y1 - y0 < FOCUS_H) { const g = (FOCUS_H - (y1 - y0)) / 2; y0 -= g; y1 += g; }
  if (x1 - x0 >= world[2] * 0.8 || y1 - y0 >= world[3] * 0.8) return world;
  return [x0, y0, x1 - x0, y1 - y0];
}

/** What the map's SVG needs to start: its view, the world, and a first guess at the zoom. */
export function framing(atlas: AtlasData, focus: AtlasPlaceData | undefined, freshTags: string[]) {
  const box = viewBox(atlas, focus, freshTags);
  const k = STAGE_GUESS / box[2];
  return {
    viewBox: boxText(box),
    world: boxText(worldBox(atlas)),
    // One screen pixel in world units: labels keep their size in pixels whatever the zoom.
    unit: `${(box[2] / STAGE_GUESS).toFixed(3)}px`,
    zoom: k >= 1.5 ? "near" : k >= 0.9 ? "mid" : "far",
  };
}

/* --- the last visit --------------------------------------------------------------------- */

/** When the reader was last on the Atlas, in two cookies, each a timestamp only (epoch seconds), as
   ui-pudl keeps them: SEEN, the last time, kept a year; SINCE, what this visit counts as new from,
   kept while the reader comes back within two hours, so a reload counts the same things. */
export const SEEN = "bcn-atlas-seen";
export const SINCE = "bcn-atlas-since";
const VISIT_S = 2 * 60 * 60;
const YEAR_S = 365 * 24 * 60 * 60;
/** A first visit counts this far back. */
export const FIRST_MS = 14 * 24 * 60 * 60 * 1000;

function stamp(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const s = Number(raw);
  return s > 0 ? s * 1000 : null;
}

/** What's new is new since this (ms): the visit's baseline, else the last visit, else two weeks ago. */
export function visitSince(cookie: (name: string) => string | undefined, now: number): number {
  return stamp(cookie(SINCE)) ?? stamp(cookie(SEEN)) ?? now - FIRST_MS;
}

/** The cookies a view of the Atlas sets: the visit goes on from [since]; the reader was here [now]. */
export function visitCookies(since: number, now: number, secure: boolean): string[] {
  const attrs = `; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
  return [
    `${SINCE}=${Math.floor(since / 1000)}; Max-Age=${VISIT_S}${attrs}`,
    `${SEEN}=${Math.floor(now / 1000)}; Max-Age=${YEAR_S}${attrs}`,
  ];
}

/* --- what's new ------------------------------------------------------------------------- */

export type CatalogPost = { title?: string; slug?: string | null; publishedAt?: string | null; tags?: string[] | null };
export type CatalogFactoid = { selector: string; createdAt?: string | null; updatedAt?: string | null; tags?: string[] | null };

export type FreshItem = {
  kind: "article" | "factoid"; freshness: Freshness; title: string; href: string; at: string; date: string;
  places: { tag: string; href: string }[];
};

/** The most What's new lists. */
export const MOST_FRESH = 40;

const after = (value: string | null | undefined, since: number) => {
  const t = value ? Date.parse(value) : NaN;
  return Number.isFinite(t) && t > since;
};
const newestFirst = (a: string, b: string) => Date.parse(b) - Date.parse(a);

/**
 * What's new since [since]: posts published since (new), factoids taught since (new), and factoids
 * changed since but taught before (changed). Ranked new posts, then new factoids, then changes,
 * newest first in each. Each item is found at the places its tags name, biggest first; [byPlace]
 * says how much is fresh at each place.
 */
export function whatsNew(posts: CatalogPost[], factoids: CatalogFactoid[], since: number, atlas: AtlasData) {
  const size = new Map(atlas.places.map((p) => [p.tag, Number(p.articleCount) + Number(p.factoidCount)]));
  const on = (tags: string[] | null | undefined) =>
    [...new Set((tags || []).map((t) => t.toLowerCase()))]
      .filter((t) => size.has(t))
      .sort((a, b) => size.get(b)! - size.get(a)! || a.localeCompare(b))
      .map((tag) => ({ tag, href: atlasHref(tag) }));

  const fresh: FreshItem[] = [];
  const seen = new Set<string>();
  for (const p of posts.filter((p) => p.slug && after(p.publishedAt, since)).sort((a, b) => newestFirst(a.publishedAt!, b.publishedAt!))) {
    if (seen.has(p.slug!)) continue;
    seen.add(p.slug!);
    fresh.push({ kind: "article", freshness: "new", title: p.title || p.slug!, href: postHref(p.slug!), at: p.publishedAt!, date: formatDate(p.publishedAt!), places: on(p.tags) });
  }
  // An API that doesn't say when a factoid was taught: its last change is all there is.
  const taught = factoids.filter((f) => after(f.createdAt ?? f.updatedAt, since));
  for (const f of [...taught].sort((a, b) => newestFirst((a.createdAt ?? a.updatedAt)!, (b.createdAt ?? b.updatedAt)!))) {
    const at = (f.createdAt ?? f.updatedAt)!;
    fresh.push({ kind: "factoid", freshness: "new", title: f.selector, href: factoidHref(f.selector), at, date: formatDate(at), places: on(f.tags) });
  }
  const changed = factoids.filter((f) => !taught.includes(f) && after(f.updatedAt, since));
  for (const f of changed.sort((a, b) => newestFirst(a.updatedAt!, b.updatedAt!))) {
    fresh.push({ kind: "factoid", freshness: "changed", title: f.selector, href: factoidHref(f.selector), at: f.updatedAt!, date: formatDate(f.updatedAt!), places: on(f.tags) });
  }

  const byPlace = new Map<string, FreshCount>();
  for (const item of fresh) {
    for (const { tag } of item.places) {
      const c = byPlace.get(tag) ?? { new: 0, changed: 0 };
      if (item.freshness === "new") c.new++;
      else c.changed++;
      byPlace.set(tag, c);
    }
  }
  return { items: fresh, byPlace, newCount: fresh.filter((i) => i.freshness === "new").length };
}
