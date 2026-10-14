/* The Atlas's map, drawn from the API's layout (ui-primate#48): each region and place where the API
   put it, at the size it gave, with its pins. The view draws it, on the server and again in the
   browser, so this is safe in both: it imports nothing of the server's. #lib/atlas.ts keeps the
   rest (framing, the visit, what's new). */
import type { components } from "#api/schema.d.ts";
import { factoidHref } from "#lib/factoids.ts";

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

/** Pins are this many world units across. */
const PIN_SIZE = 7;

export const n = (v: number) => String((Math.sign(v) * Math.round(Math.abs(v) * 10)) / 10 || 0);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export const tagHref = (tag: string) => `/tags/${encodeURIComponent(tag)}`;
export const atlasHref = (tag: string) => `/atlas?at=${encodeURIComponent(tag)}`;
export const postHref = (slug: string) => `/posts/${slug}`;

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

/** The places as the map needs them, sent to the view as its props (ui-primate#48). Everything the
   map draws is worked out from this in the view, on the server and again in the browser, so the
   page carries the API's layout once rather than both it and its drawing. Pins keep only what
   they draw: their dates are for whatsNew, here. */
export type MapData = Pick<AtlasData, "regions"> & {
  places: (Omit<AtlasPlaceData, "pins"> & { pins?: Pick<AtlasPinData, "kind" | "title" | "slug" | "selector" | "x" | "y">[] })[];
};

export function mapData(atlas: AtlasData): MapData {
  return {
    regions: atlas.regions,
    places: atlas.places.map(({ pins, ...place }) => ({
      ...place,
      pins: (pins || []).map(({ kind, title, slug, selector, x, y }) => ({ kind, title, slug, selector, x, y })),
    })),
  };
}

/** The regions as they're drawn, each with its places, in the API's order. [fresh] is what's
   new or changed at each place, by tag. */
export function regionViews(atlas: MapData, focus: string | null, fresh: Record<string, FreshCount>): RegionView[] {
  return atlas.regions.map((region) => {
    const places = atlas.places
      .filter((p) => p.region === region.id)
      .map((p) => placeView(p as AtlasPlaceData, focus, fresh[p.tag]));
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
