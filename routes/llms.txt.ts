import route from "primate/route";
import { ApiUnavailable, cachedGet } from "#api/client.ts";
import type { ContentList, Features } from "#api/types.ts";
import { siteUrl } from "#lib/meta.ts";

/* A short guide to the site for language models, as the llms.txt convention has it (#73). It's
   bounded: the latest posts, then where the rest are (the sitemap, the feeds, the tags), and a line
   for each other section saying what's there, not listing it. So it stays the same size as the
   archive grows, and it's no older than the API answers it's built from (cached as the pages'). */
const LATEST = 30;

/* Text for one Markdown line: whitespace as single spaces, and brackets escaped in a link's text. */
const line = (text: string | null | undefined) => (text || "").replace(/\s+/g, " ").trim();
const linkText = (text: string | null | undefined) => line(text).replace(/[[\]]/g, (c) => `\\${c}`);

export default route({
  async get() {
    let posts: ContentList | null;
    try {
      posts = await cachedGet<ContentList>("/posts", { page: 0, size: LATEST });
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e;
      return new Response("llms.txt is unavailable just now.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    const features = await cachedGet<Features>("/features").catch(() => null);
    const factoids = !!features?.operationGroups?.includes("factoid");
    const site = siteUrl();
    const listed = (posts?.posts || []).slice(0, LATEST);
    const total = posts?.totalCount ?? listed.length;

    const out = [
      `# ${line(features?.siteName) || "ByteCode.News"}`,
      "",
      "> Programming news and technical writing.",
      "",
      `## Latest posts`,
      "",
      ...listed.map((p) => `- [${linkText(p.title)}](${site}/posts/${p.slug})${line(p.excerpt) ? `: ${line(p.excerpt)}` : ""}`),
      "",
      "## Everything else",
      "",
      `- [Sitemap](${site}/sitemap.xml): every post's address${total > listed.length ? `, all ${total} posts` : ""}`,
      `- [RSS feed](${site}/feed.xml) and [Atom feed](${site}/feed.atom): the posts, newest first`,
      `- [Podcast feed](${site}/podcast.xml): the posts that have a recording`,
      `- [Tags](${site}/tags): the posts by subject`,
      "",
      "## Sections",
      "",
      `- [Logs](${site}/logs): the public chat channels' logs, by channel and day; a day can be filtered to one conversation`,
      `- [Atlas](${site}/atlas): the site's tags as a map, where tags used together share a region`,
      ...(factoids ? [`- [Factoids](${site}/factoids): short shared reference entries`] : []),
      "",
    ];
    return new Response(out.join("\n"), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  },
});
