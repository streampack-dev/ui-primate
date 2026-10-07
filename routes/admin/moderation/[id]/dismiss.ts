import route from "primate/route";
import { csrfOk } from "#auth/readers.ts";
import { admin, notFound } from "#lib/admin.ts";
import { ID, moderate, readForm } from "#lib/moderation.ts";
import { reportPage } from "../[id].ts";

/* Dismissing an open report, as the admin: nothing needed doing. Its lines are left as they are. */
export default route({
  async post(request) {
    const id = request.path.get("id");
    if (!admin() || !ID.test(id)) return notFound();
    const { note, one } = readForm(await request.body.formEntries());
    if (!csrfOk(one("csrf"))) return new Response("Forbidden", { status: 403 });
    return moderate(`/admin/moderation/reports/${id}/dismiss`, note ? { note } : {}, `/admin/moderation/${id}`, "dismissed",
      (error, status) => reportPage(id, { error }, status), "The report wasn't dismissed.");
  },
});
