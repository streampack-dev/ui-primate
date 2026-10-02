import route from "primate/route";
import type { ContentList } from "#api/types.ts";
import { getAsReader } from "#auth/signed-in.ts";
import { formatDate } from "#lib/format.ts";
import { admin, adminPage, doneSaying, notFound } from "#lib/admin.ts";

/* Drafts waiting for review, and the deleted ones, twenty to a page, read as the admin. Approving
   and deleting go by the editor's own questions, which come back here. */
const SAID = {
  approved: () => "Approved and published.",
  deleted: () => "Deleted. It's in the Deleted list.",
  purged: () => "Deleted for good.",
};

export default route({
  async get(request) {
    if (!admin()) return notFound();
    const deleted = request.query.try("deleted") !== undefined;
    const asked = Number.parseInt(request.query.try("page") || "0", 10);
    const page = Number.isFinite(asked) && asked >= 0 ? asked : 0;
    const href = (p: number) => `/admin/pending${deleted ? "?deleted" : ""}${p > 0 ? `${deleted ? "&" : "?"}page=${p}` : ""}`;

    let list: ContentList | null = null;
    let failed = false;
    try {
      list = await getAsReader<ContentList>("/admin/posts/pending", { page, size: 20, deleted: String(deleted) });
    } catch {
      failed = true;
    }
    return adminPage("AdminPending.marko", {
      deleted,
      failed,
      status: doneSaying(request.query.try("done"), undefined, SAID),
      drafts: (list?.posts || []).map((p) => ({
        id: p.id || "", title: p.title || "", excerpt: p.excerpt || "", author: p.authorDisplayName || "Anonymous",
        published: p.publishedAt || "", date: p.publishedAt ? formatDate(p.publishedAt) : "", categories: p.categories || [],
      })),
      prev: page > 0 ? href(page - 1) : null,
      next: page + 1 < (list?.totalPages ?? 0) ? href(page + 1) : null,
    }, "Pending drafts", "/admin/pending");
  },
});
