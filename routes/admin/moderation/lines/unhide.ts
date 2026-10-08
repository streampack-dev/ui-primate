import route from "primate/route";
import { csrfOk } from "#auth/readers.ts";
import { admin, notFound } from "#lib/admin.ts";
import { dayHref, moderate, readForm } from "#lib/moderation.ts";
import { asked, dayPage } from "../logs.ts";

/* Showing the checked lines of an admin day view in the public log again, as the admin. */
export default route({
  async post(request) {
    if (!admin()) return notFound();
    const { lineIds, note, one } = readForm(await request.body.formEntries());
    if (!csrfOk(one("csrf"))) return new Response("Forbidden", { status: 403 });
    const at = asked(one("provenance"), one("day"), one("events"));
    if (!at) return notFound();
    if (lineIds.length === 0) return dayPage(at.provenance, at.day, { error: "Select the lines to unhide first.", note }, 400, at.conversation);
    return moderate("/admin/moderation/lines/unhide", { lineIds, ...(note ? { note } : {}) }, dayHref(at.provenance, at.day, at.conversation), "unhidden",
      (error, status) => dayPage(at.provenance, at.day, { error, checked: lineIds, note }, status, at.conversation), "The lines weren't unhidden.");
  },
});
