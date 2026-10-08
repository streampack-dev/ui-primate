import route from "primate/route";
import { ApiUnavailable, cachedGet } from "#api/client.ts";
import type { ContentList } from "#api/types.ts";
import {
  type AtlasData, type CatalogFactoid, type CatalogPost, findPlace, framing, KINDS, MOST_FRESH, PIN_KINDS, regionViews,
  visitCookies, visitSince, whatsNew,
} from "#lib/atlas.ts";
import { formatDate } from "#lib/format.ts";
import { view } from "#lib/view.ts";

/* The Atlas (ui-pudl#184): the site's tags as places on a map, drawn here as SVG from the API's
   layout (GET /atlas), so it works without script; client/atlas.ts adds zoom, pan and find. Each
   place links to its tag's page, each pin to its post or factoid. The list of regions and their
   places beside it is the way in without the map. `/atlas?at=<tag>` frames a place.

   What's new since the reader's last visit (two cookies, timestamps only) marks places with a dot
   or a small ring and is listed; so the page depends on the reader's cookies, and is
   `private, no-cache`. */

type FactoidList = { factoids?: CatalogFactoid[]; totalPages?: number };

/** The posts published since [since], newest first: pages of 100 until one is older. */
async function postsSince(since: number): Promise<CatalogPost[]> {
  const all: CatalogPost[] = [];
  for (let page = 0; page < 3; page++) {
    const list = await cachedGet<ContentList>("/posts", { page, size: 100 });
    const posts = (list?.posts || []) as CatalogPost[];
    all.push(...posts);
    const last = posts.at(-1)?.publishedAt;
    if (!posts.length || page + 1 >= (list?.totalPages ?? 0) || (last && Date.parse(last) <= since)) break;
  }
  return all;
}

/** Every factoid (the API lists them by name, not by time). */
async function allFactoids(): Promise<CatalogFactoid[]> {
  const all: CatalogFactoid[] = [];
  for (let page = 0; page < 10; page++) {
    const list = await cachedGet<FactoidList>("/factoids", { page, size: 100 });
    all.push(...(list?.factoids || []));
    if (page + 1 >= (list?.totalPages ?? 0)) break;
  }
  return all;
}

const PRIVATE = "private, no-cache";

export default route({
  async get(request) {
    const asked = (request.query.try("at") || "").trim();
    let atlas: AtlasData | null;
    try {
      atlas = await cachedGet<AtlasData>("/atlas");
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e;
      atlas = null;
    }

    const now = Date.now();
    const since = visitSince((name) => request.cookies.try(name), now);
    let fresh: ReturnType<typeof whatsNew> | null = null;
    if (atlas) {
      try {
        const [posts, factoids] = await Promise.all([postsSince(since), allFactoids()]);
        fresh = whatsNew(posts, factoids, since, atlas);
      } catch (e) {
        if (!(e instanceof ApiUnavailable)) throw e;
      }
    }

    const focus = atlas ? findPlace(atlas, asked) : undefined;
    const freshTags = fresh ? [...fresh.byPlace.keys()] : [];
    const regions = atlas ? regionViews(atlas, focus?.tag ?? null, fresh?.byPlace ?? new Map()) : [];
    const meta = {
      title: focus ? `${focus.tag} | Atlas` : "Atlas",
      description: "The tags of bytecode.news as a map: where the community writes, and where it only defines.",
      path: "/atlas",
    };
    const draw = view("Atlas.marko", {
      unavailable: !atlas,
      regions,
      placeCount: atlas?.places.length ?? 0,
      tags: atlas ? atlas.places.map((p) => p.tag).sort((a, b) => a.localeCompare(b)) : [],
      focus: focus?.tag ?? null,
      asked,
      missed: asked && atlas && !focus ? asked : null,
      ...(atlas ? framing(atlas, focus, freshTags) : { viewBox: "0 0 1 1", world: "0 0 1 1", unit: "1px", zoom: "far" }),
      kinds: KINDS,
      pinKinds: PIN_KINDS,
      fresh: fresh
        ? {
          since: formatDate(new Date(since).toISOString()),
          items: fresh.items.slice(0, MOST_FRESH),
          more: Math.max(0, fresh.items.length - MOST_FRESH),
          newCount: fresh.newCount,
          changedCount: fresh.items.length - fresh.newCount,
          any: fresh.items.length > 0,
        }
        : null,
      meta,
    }, { status: atlas ? 200 : 503 });

    // The visit's cookies, and a page only this reader's browser keeps, set on whatever Primate
    // answers (the page, or its JSON for a client-side navigation).
    const secure = process.env.SESSION_COOKIE_SECURE === "true";
    return async (app: unknown, transfer: unknown, req: unknown) => {
      const response = await (draw as unknown as (a: unknown, t: unknown, r: unknown) => Promise<Response>)(app, transfer, req);
      if (atlas) for (const c of visitCookies(since, now, secure)) response.headers.append("Set-Cookie", c);
      // Primate's JSON for a client-side navigation is no-store already, which is stricter.
      if (!(response.headers.get("Content-Type") || "").includes("json")) response.headers.set("Cache-Control", PRIVATE);
      return response;
    };
  },
});
