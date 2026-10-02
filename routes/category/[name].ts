import route from "primate/route";
import { ApiUnavailable, cachedGet } from "#api/client.ts";
import type { ContentList } from "#api/types.ts";
import { view } from "#lib/view.ts";
import { notFound } from "#lib/post-page.ts";
import { pageAsked, pager, postRows } from "#lib/post-rows.ts";

/* The published posts in a category, twenty to a page, as ui-nextjs has them. The site's own
   categories (_sidebar and the like) aren't sections, as the API's taxonomy leaves them out too. */
export default route({
  async get(request) {
    const raw = request.path.get("name");
    let category: string;
    try {
      category = decodeURIComponent(raw);
    } catch {
      category = raw;
    }
    if (!category || category.startsWith("_")) return notFound();
    const page = pageAsked(request.query.try("page"));
    const path = `/category/${encodeURIComponent(category)}`;
    const meta = { title: category, description: `Articles in ${category} on bytecode.news`, path };

    let list: ContentList | null;
    try {
      list = await cachedGet<ContentList>("/posts", { category, page, size: 20 });
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e;
      return view("BackendUnavailable.marko", { meta }, { status: 503 });
    }
    const count = Number(list?.totalCount ?? 0);
    return view("Category.marko", {
      category,
      count: `${count} article${count === 1 ? "" : "s"}`,
      posts: postRows(list?.posts),
      ...pager(page, list?.totalPages ?? 0, (p) => (p > 0 ? `${path}?page=${p}` : path)),
      meta,
    });
  },
});
