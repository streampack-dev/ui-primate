import route from "primate/route";
import { ApiUnavailable, cachedGet } from "#api/client.ts";
import type { ContentList } from "#api/types.ts";
import { view } from "#lib/view.ts";
import { pageAsked, pager, postRows } from "#lib/post-rows.ts";

/* The published posts with a tag, twenty to a page. */
export default route({
  async get(request) {
    const raw = request.path.get("name");
    let tag: string;
    try {
      tag = decodeURIComponent(raw);
    } catch {
      tag = raw;
    }
    const page = pageAsked(request.query.try("page"));
    const path = `/tags/${encodeURIComponent(tag)}`;
    const meta = { title: tag, description: `Articles tagged "${tag}" on bytecode.news`, path };

    let list: ContentList | null;
    try {
      list = await cachedGet<ContentList>("/posts", { tag, page, size: 20 });
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e;
      return view("BackendUnavailable.marko", { meta }, { status: 503 });
    }
    const count = Number(list?.totalCount ?? 0);
    return view("Tag.marko", {
      tag,
      count: `${count} article${count === 1 ? "" : "s"}`,
      posts: postRows(list?.posts),
      ...pager(page, list?.totalPages ?? 0, (p) => (p > 0 ? `${path}?page=${p}` : path)),
      meta,
    });
  },
});
