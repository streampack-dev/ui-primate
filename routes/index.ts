import route from "primate/route";
import { cachedGet } from "#api/client.ts";
import type { ContentList } from "#api/types.ts";
import { listed } from "#lib/audio.ts";
import { formatDate } from "#lib/format.ts";
import { view } from "#lib/view.ts";

/* The front page: the newest posts (the lead, two beside it, six below the fold) and, on the first
   page, the popular ones; later pages, nine at a time. */
export default route({
  async get(request) {
    const asked = Number.parseInt(request.query.try("page") || "0", 10);
    const page = Number.isFinite(asked) && asked >= 0 ? asked : 0;
    const [list, popular] = await Promise.allSettled([
      cachedGet<ContentList>("/posts", { page, size: 9 }),
      page === 0 ? cachedGet<ContentList>("/posts/popular", { page: 0, size: 3 }) : Promise.resolve(null),
    ]);
    if (list.status === "rejected" || !list.value) {
      return view("Unavailable.marko", { meta: {} }, { status: 503 });
    }
    const posts = (list.value.posts || []).map((p) => ({
      id: p.id, title: p.title, slug: p.slug, excerpt: p.excerpt?.trim() || "",
      author: p.authorDisplayName, published: p.publishedAt, date: formatDate(p.publishedAt),
      comments: p.commentCount || 0, tags: p.tags || [], audio: listed(p.versionKinds),
    }));
    return view("Front.marko", {
      page,
      totalPages: list.value.totalPages || 0,
      posts,
      popular: popular.status === "fulfilled" && popular.value
        ? (popular.value.posts || []).map((p) => ({ id: p.id, title: p.title, slug: p.slug, excerpt: p.excerpt?.trim() || "", author: p.authorDisplayName, published: p.publishedAt, date: formatDate(p.publishedAt), audio: listed(p.versionKinds) }))
        : [],
      dateline: new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).toUpperCase(),
      meta: { path: page ? `/?page=${page}` : "/" },
    });
  },
});
