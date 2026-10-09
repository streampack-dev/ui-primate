import route from "primate/route";
import { cachedGet } from "#api/client.ts";
import type { components } from "#api/schema.d.ts";
import { view } from "#lib/view.ts";

type Feeds = components["schemas"]["RssFeedSourcesResponse"];

/* Every feed the site follows (#28), for anyone looking for a feed's address to subscribe an IRC
   channel to it (`feed subscribe <url>`): the reader's landing page links here, and that's all; it
   isn't put in anyone's way. Sorted by title, filtered over title and address by a plain GET form
   (?q=). Each row's command is selectable text, and client/feeds.ts adds a Copy button to it. */
const latest = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "";

export default route({
  async get(request) {
    const q = (request.query.try("q") || "").trim();
    let answer: Feeds | undefined;
    try {
      answer = await cachedGet<Feeds>("/rss/feeds");
    } catch {
      return view("RssUnavailable.marko", { meta: { title: "RSS Feeds Unavailable" } }, { status: 503 });
    }
    const all = (answer?.feeds || [])
      .filter((f) => f.feedUrl)
      .map((f) => ({
        title: f.title?.trim() || f.feedUrl,
        feedUrl: f.feedUrl,
        siteUrl: f.siteUrl || "",
        items: `${f.itemCount ?? 0} item${f.itemCount === 1 ? "" : "s"}`,
        latest: f.latestItemTimestamp || "",
        latestDate: latest(f.latestItemTimestamp),
        command: `feed subscribe ${f.feedUrl}`,
      }))
      .sort((a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base" }) || a.feedUrl.localeCompare(b.feedUrl));
    const needle = q.toLowerCase();
    const feeds = needle ? all.filter((f) => f.title.toLowerCase().includes(needle) || f.feedUrl.toLowerCase().includes(needle)) : all;
    const noun = (n: number) => `${n} feed${n === 1 ? "" : "s"}`;

    return view("RssFeeds.marko", {
      q,
      feeds,
      count: needle ? `${feeds.length} of ${noun(all.length)}` : noun(all.length),
      meta: { title: "All RSS Feeds", description: "Every RSS feed bytecode.news follows, with its address for subscribing an IRC channel.", path: "/rss/feeds" },
    });
  },
});
