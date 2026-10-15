import route from "primate/route";
import { ApiRefused, ApiUnavailable, cachedGet } from "#api/client.ts";
import type { ContentList } from "#api/types.ts";
import { view } from "#lib/view.ts";
import { pageAsked, pager, postRows } from "#lib/post-rows.ts";

/* Searching the posts: the API's full-text search over titles, tags, excerpts and bodies
   (streampack V47), twenty to a page, drawn here; the header's search boxes and this page's own
   come here. Words are stemmed, and quoted ones match exactly (streampack#227); each result shows
   the passage that matched, its words marked (#54). A query the API refuses (too long, too many
   quotes) is shown with its reason. Results pages are kept out of search engines. */
const SIZE = 20;

export default route({
  async get(request) {
    const q = (request.query.try("q") || "").trim();
    const page = pageAsked(request.query.try("page"));
    const robots = "noindex, follow";
    if (!q) return view("Search.marko", { q, list: null, meta: { title: "Search", robots } });

    let list: ContentList | null;
    try {
      list = await cachedGet<ContentList>("/posts/search", { q, page, size: SIZE });
    } catch (e) {
      if (e instanceof ApiRefused && e.status === 400 && e.detail) {
        return view("Search.marko", { q, list: null, error: e.detail, meta: { title: "Search", robots } }, { status: 400 });
      }
      if (!(e instanceof ApiUnavailable)) throw e;
      return view("SearchUnavailable.marko", { meta: { title: "Search", robots } }, { status: 503 });
    }
    const totalPages = list?.totalPages ?? 0;
    const count = Number(list?.totalCount ?? 0);
    const href = (p: number) => `/search?${new URLSearchParams({ q, ...(p > 0 ? { page: String(p) } : {}) })}`;
    return view("Search.marko", {
      q,
      list: {
        count: `${count} match${count === 1 ? "" : "es"}`,
        posts: postRows(list?.posts),
        ...pager(page, totalPages, href),
      },
      meta: { title: `Search: ${q}`, robots },
    });
  },
});
