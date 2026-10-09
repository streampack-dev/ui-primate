import response from "primate/response";
import route from "primate/route";
import { cachedGet, stale } from "#api/client.ts";
import type { components } from "#api/schema.d.ts";
import { csrf, current, isAdmin } from "#auth/readers.ts";
import { FILTERS, RATINGS, itemAnchor, ratingFilter, ratingSaid } from "#lib/rss-ratings.ts";
import { view } from "#lib/view.ts";

type Items = components["schemas"]["RssAggregatedItemsResponse"];
type AdminItems = components["schemas"]["AdminRssItemsResponse"];
type Feeds = components["schemas"]["RssFeedSourcesResponse"];

/* The RSS reader, as ui-nextjs has it: the items stored from the site's subscribed feeds, newest
   first, filtered by feed and by title with a plain GET form, twenty to a page. A link out records
   that it was followed (client/read.ts). Refresh (#5) asks the API again past the answers this app
   keeps for a few minutes, keeping the filters and page; Primate's client draws the answer in place.
   It can't make streampack poll the feeds sooner: it shows what streampack has gathered.

   ?view=feeds (#28) swaps the items for the feed list, as IRC's `feed list` gives it: "Title -
   address", by title, paged as the items are, for anyone after a feed's address to subscribe a
   channel. Only a small "Feed list" link (not on a phone) leads there; "Back to items" and the
   filter form lead back.

   Admins (#27) see the same items from the API's admin list, which says how each is rated, with
   Rates / Might / Dull buttons on each (routes/admin/rss/items/[id]/rating, client/rate.ts), and
   a rating filter (?rating=unrated|rates|might|dull) in the form. Anyone else's reader is as it
   was: the public items, no buttons, and ?rating ignored. The model's guess is never shown. */
const SIZE = 20;

function href(page: number, feed: string, title: string, feeds = false, rating = ""): string {
  const params = new URLSearchParams();
  if (feeds) params.set("view", "feeds");
  if (page > 0) params.set("page", String(page));
  if (feed) params.set("feed", feed);
  if (title) params.set("title", title);
  if (rating) params.set("rating", rating);
  return params.size ? `/rss?${params}` : "/rss";
}

const published = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "undated";

/** When the newest item shown arrived, as "newest item 12 minutes ago"; empty without items. */
function newest(items: { receivedAt?: string }[], now = Date.now()): string {
  const times = items.map((i) => Date.parse(i.receivedAt || "")).filter(Number.isFinite);
  if (!times.length) return "";
  const minutes = Math.max(0, Math.round((now - Math.max(...times)) / 60_000));
  if (minutes < 1) return "newest item just now";
  if (minutes < 60) return `newest item ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `newest item ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `newest item ${days} days ago`;
}

/** The feed list (?view=feeds): every feed the API lists, by title, a page at a time. */
async function feedList(page: number) {
  let answer: Feeds | null;
  try {
    answer = await cachedGet<Feeds>("/rss/feeds");
  } catch {
    return view("RssUnavailable.marko", { meta: { title: "RSS Reader Unavailable" } }, { status: 503 });
  }
  const all = (answer?.feeds || [])
    .filter((f) => f.feedUrl)
    .map((f) => ({ title: f.title?.trim() || "", feedUrl: f.feedUrl, siteUrl: f.siteUrl || "", itemCount: f.itemCount }))
    .sort((a, b) => (a.title || a.feedUrl).localeCompare(b.title || b.feedUrl, "en", { sensitivity: "base" }) || a.feedUrl.localeCompare(b.feedUrl));
  const pages = Math.ceil(all.length / SIZE);
  return view("Rss.marko", {
    feed: "",
    title: "",
    feeds: all.map((f) => ({ value: f.feedUrl, label: `${f.title || f.feedUrl} (${f.itemCount} item${f.itemCount === 1 ? "" : "s"})` })),
    ...NOT_RATING,
    listing: true,
    list: all.slice(page * SIZE, (page + 1) * SIZE).map(({ title, feedUrl, siteUrl }) => ({ title, feedUrl, siteUrl })),
    count: `${all.length} feed${all.length === 1 ? "" : "s"}`,
    filtered: false,
    refresh: `${href(page, "", "", true)}&refresh`,
    newest: "",
    items: [],
    prev: page > 0 ? href(page - 1, "", "", true) : null,
    next: page + 1 < pages ? href(page + 1, "", "", true) : null,
    meta: { title: "RSS Feed List", description: "Every RSS feed bytecode.news follows, with its address.", path: "/rss?view=feeds" },
  });
}

/** The admin's items, rated; null when they can't be had (the public items are shown instead). */
async function adminItems(page: number, feed: string, title: string, rating: string): Promise<AdminItems | null> {
  try {
    const { getAsReader } = await import("#auth/signed-in.ts");
    return await getAsReader<AdminItems>("/admin/rss/items", { rating: rating || "all", page, size: SIZE, feed: feed || undefined, title: title || undefined });
  } catch {
    return null;
  }
}

/** What a reader who isn't rating gets: no buttons, no rating filter. */
const NOT_RATING = { rates: false, csrf: "", back: "", rating: "", ratingNote: "", ratings: [], filters: [] };

export default route({
  async get(request) {
    const asked = Number.parseInt(request.query.try("page") || "0", 10);
    const page = Number.isFinite(asked) && asked >= 0 ? asked : 0;
    const feed = (request.query.try("feed") || "").trim();
    const title = (request.query.try("title") || "").trim();
    const listing = request.query.try("view") === "feeds";
    const rates = isAdmin(current());
    const rating = rates ? ratingFilter(request.query.try("rating")) : "";
    if (request.query.try("refresh") !== undefined) {
      stale("/rss/");
      return listing ? response.redirect(href(page, "", "", true), 303) : response.redirect(href(page, feed, title, false, rating), 303);
    }
    if (listing) return feedList(page);

    const rated = rates ? await adminItems(page, feed, title, rating) : null;
    const [items, feeds] = await Promise.allSettled([
      rated ? Promise.resolve(rated as Items) : cachedGet<Items>("/rss/items", { page, size: SIZE, feed: feed || undefined, title: title || undefined }),
      cachedGet<Feeds>("/rss/feeds"),
    ]);
    if (items.status === "rejected") {
      return view("RssUnavailable.marko", { meta: { title: "RSS Reader Unavailable" } }, { status: 503 });
    }
    const result = (items.value ?? { items: [], page: 0, totalPages: 0, totalCount: 0 }) as Items & AdminItems;
    // An admin whose ratings couldn't be read gets the public items, unrated and unfiltered, and is told.
    const filter = rated ? rating : "";
    const here = href(page, feed, title, false, filter);
    const sources = feeds.status === "fulfilled" ? feeds.value?.feeds || [] : [];
    const count = Number(result.totalCount ?? 0);

    return view("Rss.marko", {
      feed,
      title,
      ...(rates ? {
        rates: !!rated,
        csrf: rated ? csrf() : "",
        back: here,
        rating: filter,
        ratingNote: rated ? "" : `The ratings couldn't be read just now, so these items are shown unrated${rating ? " and not filtered by rating" : ""}.`,
        ratings: rated ? RATINGS.map((r) => ({ ...r })) : [],
        filters: rated ? FILTERS.map((f) => ({ ...f })) : [],
      } : NOT_RATING),
      listing: false,
      list: [],
      feeds: [
        // A feed asked for that isn't listed is kept, so the form shows what's filtered.
        ...(feed && !sources.some((f) => f.feedUrl === feed || f.title === feed) ? [{ value: feed, label: feed }] : []),
        ...sources.map((f) => ({ value: f.feedUrl || "", label: `${f.title || f.feedUrl} (${f.itemCount} item${f.itemCount === 1 ? "" : "s"})` })),
      ],
      count: `${count} item${count === 1 ? "" : "s"}`,
      filtered: !!(feed || title || filter),
      refresh: `${here}${here.includes("?") ? "&" : "?"}refresh`,
      newest: newest(result.items || []),
      items: (result.items || []).map((i) => ({
        id: i.id || "",
        title: i.title || i.link || "",
        link: i.link || "",
        published: i.publishedAt || "",
        date: published(i.publishedAt),
        summary: i.summary?.trim() || "",
        // Only the admin's own rating: never anything the model guessed.
        ...(rated ? { anchor: itemAnchor(i.id || ""), rating: i.rating ?? "", said: ratingSaid(i.rating, i.ratedBy) } : {}),
      })),
      prev: page > 0 ? href(page - 1, feed, title, false, filter) : null,
      next: page + 1 < (result.totalPages ?? 0) ? href(page + 1, feed, title, false, filter) : null,
      meta: { title: "RSS Reader", description: "Browse stored RSS items from bytecode.news subscribed sources.", path: "/rss" },
    }, rates ? { headers: { "Cache-Control": "private, no-store" } } : {});
  },
});
