import response from "primate/response";
import route from "primate/route";
import { cachedGet, stale } from "#api/client.ts";
import type { components } from "#api/schema.d.ts";
import { view } from "#lib/view.ts";

type Items = components["schemas"]["RssAggregatedItemsResponse"];
type Feeds = components["schemas"]["RssFeedSourcesResponse"];

/* The RSS reader, as ui-nextjs has it: the items stored from the site's subscribed feeds, newest
   first, filtered by feed and by title with a plain GET form, twenty to a page. A link out records
   that it was followed (client/read.ts). Refresh (#5) asks the API again past the answers this app
   keeps for a few minutes, keeping the filters and page; Primate's client draws the answer in place.
   It can't make streampack poll the feeds sooner: it shows what streampack has gathered.

   ?view=feeds (#28) swaps the items for the feed list, as IRC's `feed list` gives it: "Title -
   address", by title, paged as the items are, for anyone after a feed's address to subscribe a
   channel. Only a small "Feed list" link (not on a phone) leads there; "Back to items" and the
   filter form lead back. */
const SIZE = 20;

function href(page: number, feed: string, title: string, feeds = false): string {
  const params = new URLSearchParams();
  if (feeds) params.set("view", "feeds");
  if (page > 0) params.set("page", String(page));
  if (feed) params.set("feed", feed);
  if (title) params.set("title", title);
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

export default route({
  async get(request) {
    const asked = Number.parseInt(request.query.try("page") || "0", 10);
    const page = Number.isFinite(asked) && asked >= 0 ? asked : 0;
    const feed = (request.query.try("feed") || "").trim();
    const title = (request.query.try("title") || "").trim();
    const listing = request.query.try("view") === "feeds";
    if (request.query.try("refresh") !== undefined) {
      stale("/rss/");
      return listing ? response.redirect(href(page, "", "", true), 303) : response.redirect(href(page, feed, title), 303);
    }
    if (listing) return feedList(page);

    const [items, feeds] = await Promise.allSettled([
      cachedGet<Items>("/rss/items", { page, size: SIZE, feed: feed || undefined, title: title || undefined }),
      cachedGet<Feeds>("/rss/feeds"),
    ]);
    if (items.status === "rejected") {
      return view("RssUnavailable.marko", { meta: { title: "RSS Reader Unavailable" } }, { status: 503 });
    }
    const result = items.value ?? { items: [], page: 0, totalPages: 0, totalCount: 0 };
    const sources = feeds.status === "fulfilled" ? feeds.value?.feeds || [] : [];
    const count = Number(result.totalCount ?? 0);

    return view("Rss.marko", {
      feed,
      title,
      listing: false,
      list: [],
      feeds: [
        // A feed asked for that isn't listed is kept, so the form shows what's filtered.
        ...(feed && !sources.some((f) => f.feedUrl === feed || f.title === feed) ? [{ value: feed, label: feed }] : []),
        ...sources.map((f) => ({ value: f.feedUrl || "", label: `${f.title || f.feedUrl} (${f.itemCount} item${f.itemCount === 1 ? "" : "s"})` })),
      ],
      count: `${count} item${count === 1 ? "" : "s"}`,
      filtered: !!(feed || title),
      refresh: `${href(page, feed, title)}${page > 0 || feed || title ? "&" : "?"}refresh`,
      newest: newest(result.items || []),
      items: (result.items || []).map((i) => ({
        id: i.id || "",
        title: i.title || i.link || "",
        link: i.link || "",
        published: i.publishedAt || "",
        date: published(i.publishedAt),
        summary: i.summary?.trim() || "",
      })),
      prev: page > 0 ? href(page - 1, feed, title) : null,
      next: page + 1 < (result.totalPages ?? 0) ? href(page + 1, feed, title) : null,
      meta: { title: "RSS Reader", description: "Browse stored RSS items from bytecode.news subscribed sources.", path: "/rss" },
    });
  },
});
