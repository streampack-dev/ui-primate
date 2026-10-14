/* The Atlas (ui-pudl#184): a map of the site's tags, laid out by the API (GET /atlas) so every front
   end draws the same geography. This draws it: each region and place where the API put it, at the
   size it gave, with its pins; and works out what's new since the reader's last visit.

   What's found at a place is told by shape, never by colour alone, as ui-pudl draws it: a disc for
   articles only, a ring for factoids only, a diamond for both; around it, a square for each article
   and a triangle for each factoid. A place holding something new has a dot, one holding only
   changes a small ring. Nothing here lays anything out: positions, radii and label sizes are the
   API's. */
import { type AtlasData, type AtlasPlaceData, atlasHref, type FreshCount, type Freshness, n, postHref } from "#lib/atlas-map.ts";
import { factoidHref } from "#lib/factoids.ts";
import { formatDate } from "#lib/format.ts";

export * from "#lib/atlas-map.ts";

/** A view framed on one place: this many world units across and down. */
const FOCUS_W = 640;
const FOCUS_H = 440;
/** The map's width in pixels before script measures it, for the labels' first size. */
const STAGE_GUESS = 1100;

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
