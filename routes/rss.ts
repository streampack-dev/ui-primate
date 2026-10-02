import route from "primate/route";
import { cachedGet } from "#api/client.ts";
import type { components } from "#api/schema.d.ts";
import { view } from "#lib/view.ts";

type Items = components["schemas"]["RssAggregatedItemsResponse"];
type Feeds = components["schemas"]["RssFeedSourcesResponse"];

/* The RSS reader, as ui-nextjs has it: the items stored from the site's subscribed feeds, newest
   first, filtered by feed and by title with a plain GET form, twenty to a page. A link out records
   that it was followed (client/read.ts). */
const SIZE = 20;

function href(page: number, feed: string, title: string): string {
  const params = new URLSearchParams();
  if (page > 0) params.set("page", String(page));
  if (feed) params.set("feed", feed);
  if (title) params.set("title", title);
  return params.size ? `/rss?${params}` : "/rss";
}

const published = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "undated";

export default route({
  async get(request) {
    const asked = Number.parseInt(request.query.try("page") || "0", 10);
    const page = Number.isFinite(asked) && asked >= 0 ? asked : 0;
    const feed = (request.query.try("feed") || "").trim();
    const title = (request.query.try("title") || "").trim();

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
      feeds: [
        // A feed asked for that isn't listed is kept, so the form shows what's filtered.
        ...(feed && !sources.some((f) => f.feedUrl === feed || f.title === feed) ? [{ value: feed, label: feed }] : []),
        ...sources.map((f) => ({ value: f.feedUrl || "", label: `${f.title || f.feedUrl} (${f.itemCount} item${f.itemCount === 1 ? "" : "s"})` })),
      ],
      count: `${count} item${count === 1 ? "" : "s"}`,
      filtered: !!(feed || title),
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
