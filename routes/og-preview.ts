import route from "primate/route";
import { cachedGet } from "#api/client.ts";
import type { ContentList } from "#api/types.ts";
import { siteUrl } from "#lib/meta.ts";
import { view } from "#lib/view.ts";

/* The link-preview gallery, as ui-nextjs has one: the site's card and the latest posts' as a shared
   link shows them, drawn by the app itself. For the site's own people, so search engines are asked
   to leave it be. */
export default route({
  async get() {
    let posts: ContentList["posts"] = [];
    try {
      posts = (await cachedGet<ContentList>("/posts", { page: 0, size: 5 }))?.posts || [];
    } catch {
      // The site's card still shows.
    }
    const host = siteUrl().replace(/^https?:\/\//, "");
    const cards = [
      { image: "/og/site.png", url: host, title: "ByteCode.News", description: "ByteCode.News: articles, knowledge, and community context." },
      ...(posts || []).filter((p) => p.slug && /^\d{4}\//.test(p.slug)).map((p) => ({
        image: `/og/posts/${p.slug}.png`,
        url: `${host}/posts/${p.slug}`,
        title: p.title || "",
        description: p.excerpt?.trim() || "Read the latest content on bytecode.news.",
      })),
    ];
    return view("OgPreview.marko", { cards, meta: { title: "Link previews", robots: "noindex, nofollow" } });
  },
});
