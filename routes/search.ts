import response from "primate/response";
import route from "primate/route";
import { ApiUnavailable, cachedGet } from "#api/client.ts";
import type { ContentList } from "#api/types.ts";
import { formatDate } from "#lib/format.ts";
import { meta } from "#lib/meta.ts";

/* Searching the posts, as ui-nextjs does: the API's full-text search over titles and excerpts,
   twenty to a page, drawn here; the header's search box and this page's own come here. Results
   pages are kept out of search engines. */
const SIZE = 20;

export default route({
  async get(request) {
    const q = (request.query.try("q") || "").trim();
    const asked = Number.parseInt(request.query.try("page") || "0", 10);
    const page = Number.isFinite(asked) && asked >= 0 ? asked : 0;
    const robots = "noindex, follow";
    if (!q) return response.view("Search.marko", { q, list: null }, { placeholders: { meta: meta({ title: "Search", robots }) } });

    let list: ContentList | null;
    try {
      list = await cachedGet<ContentList>("/posts/search", { q, page, size: SIZE });
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e;
      return response.view("SearchUnavailable.marko", {}, { status: 503, placeholders: { meta: meta({ title: "Search", robots }) } });
    }
    const totalPages = list?.totalPages ?? 0;
    const count = Number(list?.totalCount ?? 0);
    const href = (p: number) => `/search?${new URLSearchParams({ q, ...(p > 0 ? { page: String(p) } : {}) })}`;
    return response.view("Search.marko", {
      q,
      list: {
        count: `${count} match${count === 1 ? "" : "es"}`,
        posts: (list?.posts || []).map((p) => ({
          id: p.id || p.slug || "", title: p.title || "", href: `/posts/${p.slug}`, excerpt: p.excerpt || "",
          author: p.authorDisplayName || "", published: p.publishedAt || "", date: formatDate(p.publishedAt),
          comments: p.commentCount ? `${p.commentCount} comment${p.commentCount === 1 ? "" : "s"}` : "",
          tags: p.tags || [],
        })),
        pages: totalPages > 1 ? `Page ${page + 1} of ${totalPages}` : "",
        prev: page > 0 ? href(page - 1) : null,
        next: page + 1 < totalPages ? href(page + 1) : null,
      },
    }, { placeholders: { meta: meta({ title: `Search: ${q}`, robots }) } });
  },
});
