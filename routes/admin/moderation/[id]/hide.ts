import route from "primate/route";
import { csrfOk } from "#auth/readers.ts";
import { admin, notFound } from "#lib/admin.ts";
import { ID, moderate, readForm } from "#lib/moderation.ts";
import { reportPage } from "../[id].ts";

/* Hiding a report's checked lines from the public log, as the admin. They're kept, and can be unhidden. */
export default route({
  async post(request) {
    const id = request.path.get("id");
    if (!admin() || !ID.test(id)) return notFound();
    const { lineIds, note, one } = readForm(await request.body.formEntries());
    if (!csrfOk(one("csrf"))) return new Response("Forbidden", { status: 403 });
    if (lineIds.length === 0) return reportPage(id, { error: "Select the lines to hide first.", checked: lineIds, note }, 400);
    return moderate(`/admin/moderation/reports/${id}/hide`, { lineIds, ...(note ? { note } : {}) }, `/admin/moderation/${id}`, "hidden",
      (error, status) => reportPage(id, { error, checked: lineIds, note }, status), "The lines weren't hidden.");
  },
});
