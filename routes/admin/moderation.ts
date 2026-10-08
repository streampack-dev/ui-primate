import route from "primate/route";
import { getAsReader } from "#auth/signed-in.ts";
import { admin, adminPage, notFound } from "#lib/admin.ts";
import { shownReport, STATUSES, type ReportList, type Status } from "#lib/moderation.ts";

/* The moderation reports (streampack#150), twenty to a page, read as the admin: every status, open
   first and newest first, or one status. Each goes to its own page, where something is done. */
const SIZE = 20;

export default route({
  async get(request) {
    if (!admin()) return notFound();
    const asked = (request.query.try("status") || "").toLowerCase();
    const status = (STATUSES as readonly string[]).includes(asked) ? asked as Status : null;
    const number = Number.parseInt(request.query.try("page") || "0", 10);
    const page = Number.isFinite(number) && number >= 0 ? number : 0;
    const href = (s: Status | null, p = 0) => {
      const query = new URLSearchParams({ ...(s ? { status: s } : {}), ...(p > 0 ? { page: String(p) } : {}) }).toString();
      return `/admin/moderation${query ? `?${query}` : ""}`;
    };

    let list: ReportList | null = null;
    let failed = false;
    try {
      list = await getAsReader<ReportList>("/admin/moderation/reports", { ...(status ? { status } : {}), page, size: SIZE });
    } catch {
      failed = true;
    }
    return adminPage("AdminModeration.marko", {
      status,
      failed,
      tabs: [null, ...STATUSES].map((s) => ({
        label: s ? s.charAt(0).toUpperCase() + s.slice(1) : "All", href: href(s), current: s === status,
      })),
      reports: (list?.reports || []).map(shownReport),
      total: list?.totalCount ?? 0,
      prev: page > 0 ? href(status, page - 1) : null,
      next: page + 1 < (list?.totalPages ?? 0) ? href(status, page + 1) : null,
    }, "Moderation", "/admin/moderation", 200, list ? list.openCount : undefined);
  },
});
