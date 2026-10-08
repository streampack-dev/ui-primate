import route from "primate/route";
import { csrf, csrfOk } from "#auth/readers.ts";
import { getAsReader } from "#auth/signed-in.ts";
import { admin, notFound } from "#lib/admin.ts";
import { channelFor, ID, moderate, readForm, shownLines, type ReportDetail } from "#lib/moderation.ts";
import { view } from "#lib/view.ts";
import { reportPage } from "../[id].ts";

/* Purging a report's checked lines: deleting them from the log for good, as the admin. It can't be
   undone, so it's asked first: the report's form posts here without confirm=yes, and the answer is
   the question, on a page of its own, with the lines to go. Only that page's form, which says
   confirm=yes, reaches the API, with confirm: true. */
export default route({
  async post(request) {
    const id = request.path.get("id");
    if (!admin() || !ID.test(id)) return notFound();
    const { lineIds, note, one } = readForm(await request.body.formEntries());
    if (!csrfOk(one("csrf"))) return new Response("Forbidden", { status: 403 });
    if (lineIds.length === 0) return reportPage(id, { error: "Select the lines to purge first.", checked: lineIds, note }, 400);

    if (one("confirm") !== "yes") {
      let lines: ReturnType<typeof shownLines> = [];
      try {
        const detail = await getAsReader<ReportDetail>(`/admin/moderation/reports/${id}`);
        if (detail) {
          const channel = await channelFor(detail.report.provenanceUri);
          lines = shownLines(detail.lines.filter((l) => lineIds.includes(l.id)), channel);
        }
      } catch {
        // Asked all the same, by the count.
      }
      const n = lineIds.length;
      return view("ModerationPurge.marko", {
        title: `Purge ${n} line${n === 1 ? "" : "s"} for good?`,
        action: `/admin/moderation/${id}/purge`,
        back: `/admin/moderation/${id}`,
        lineIds: lineIds.join(","),
        lines,
        note,
        csrf: csrf(),
        meta: { title: "Purge lines?", robots: "noindex, nofollow" },
      }, { headers: { "Cache-Control": "private, no-store" } });
    }

    return moderate(`/admin/moderation/reports/${id}/purge`, { lineIds, confirm: true, ...(note ? { note } : {}) }, `/admin/moderation/${id}`, "purged",
      (error, status) => reportPage(id, { error, checked: lineIds, note }, status), "The lines weren't purged.");
  },
});
