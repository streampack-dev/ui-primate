import route from "primate/route";
import { csrfOk } from "#auth/readers.ts";
import { admin, notFound } from "#lib/admin.ts";
import { ID, moderate, readForm } from "#lib/moderation.ts";
import { reportPage } from "../[id].ts";

/* Showing a report's checked lines in the public log again, as the admin. */
export default route({
  async post(request) {
    const id = request.path.get("id");
    if (!admin() || !ID.test(id)) return notFound();
    const { lineIds, note, one } = readForm(await request.body.formEntries());
    if (!csrfOk(one("csrf"))) return new Response("Forbidden", { status: 403 });
    if (lineIds.length === 0) return reportPage(id, { error: "Select the lines to unhide first.", note }, 400);
    return moderate(`/admin/moderation/reports/${id}/unhide`, { lineIds, ...(note ? { note } : {}) }, `/admin/moderation/${id}`, "unhidden",
      (error, status) => reportPage(id, { error, checked: lineIds, note }, status), "The lines weren't unhidden.");
  },
});
