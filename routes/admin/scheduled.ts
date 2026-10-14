import route from "primate/route";
import type { ContentList } from "#api/types.ts";
import { getAsReader } from "#auth/signed-in.ts";
import { listed } from "#lib/audio.ts";
import { formatDateTime } from "#lib/format.ts";
import { admin, adminPage, notFound } from "#lib/admin.ts";

/* Posts approved to go out later (#35, streampack#207), soonest first, twenty to a page, read as the
   admin. They're in neither the public lists nor the pending drafts until then, so this is where
   one is found to change, reschedule or pull. */
export default route({
  async get(request) {
    if (!admin()) return notFound();
    const asked = Number.parseInt(request.query.try("page") || "0", 10);
    const page = Number.isFinite(asked) && asked >= 0 ? asked : 0;
    const href = (p: number) => `/admin/scheduled${p > 0 ? `?page=${p}` : ""}`;

    let list: ContentList | null = null;
    let failed = false;
    try {
      list = await getAsReader<ContentList>("/admin/posts/scheduled", { page, size: 20 });
    } catch {
      failed = true;
    }
    return adminPage("AdminScheduled.marko", {
      failed,
      posts: (list?.posts || []).map((p) => ({
        id: p.id || "", title: p.title || "", excerpt: p.excerpt || "", author: p.authorDisplayName || "Anonymous",
        published: p.publishedAt || "", when: formatDateTime(p.publishedAt), audio: listed(p.versionKinds),
      })),
      prev: page > 0 ? href(page - 1) : null,
      next: page + 1 < (list?.totalPages ?? 0) ? href(page + 1) : null,
    }, "Scheduled posts", "/admin/scheduled");
  },
});
