import route from "primate/route";
import { ApiUnavailable, cachedGet } from "#api/client.ts";
import type { ContentList } from "#api/types.ts";
import { isUserId } from "#lib/authors.ts";
import { view } from "#lib/view.ts";
import { notFound } from "#lib/post-page.ts";
import { pageAsked, pager, postRows } from "#lib/post-rows.ts";

/* An author's published posts (#88), twenty to a page, as a category's page lists them. The author
   is known by their user id (streampack#273), and named from their posts. An author with none
   published, and an id that is no one's, are the same to the API: both are an empty list, 200. */
export default route({
  async get(request) {
    const id = request.path.get("id").toLowerCase();
    if (!isUserId(id)) return notFound();
    const page = pageAsked(request.query.try("page"));
    const path = `/authors/${id}`;

    let list: ContentList | null;
    try {
      list = await cachedGet<ContentList>("/posts", { author: id, page, size: 20 });
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e;
      return view("BackendUnavailable.marko", { meta: { title: "Author", path } }, { status: 503 });
    }
    const posts = postRows(list?.posts);
    const name = (list?.posts || []).find((p) => p.authorDisplayName)?.authorDisplayName || "";
    const count = Number(list?.totalCount ?? 0);
    const meta = name
      ? { title: name, description: `Articles by ${name} on bytecode.news`, path }
      : { title: "Author", path };
    return view("Author.marko", {
      name,
      count: `${count} article${count === 1 ? "" : "s"}`,
      posts,
      ...pager(page, list?.totalPages ?? 0, (p) => (p > 0 ? `${path}?page=${p}` : path)),
      meta,
    });
  },
});
