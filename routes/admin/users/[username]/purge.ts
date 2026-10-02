import route from "primate/route";
import { send } from "#api/client.ts";
import { csrfOk } from "#auth/readers.ts";
import { bearer } from "#auth/signed-in.ts";
import { act, admin, confirmPage, notFound, USERNAME } from "#lib/admin.ts";
import { usersPage } from "../../users.ts";

export default route({
  get(request) {
    const who = request.path.get("username");
    if (!admin() || !USERNAME.test(who)) return notFound();
    return confirmPage({
      title: `Purge ${who}'s content? This cannot be undone.`, body: `Everything they posted and commented goes for good.`,
      action: `/admin/users/${who}/purge`, button: "Purge for good", back: "/admin/users?status=ERASED",
    });
  },

  async post(request) {
    const who = request.path.get("username");
    if (!admin() || !USERNAME.test(who)) return notFound();
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    return act((a) => send("DELETE", `/admin/users/${who}/purge`, undefined, bearer(a)),
      `/admin/users?status=ERASED&done=purged&who=${who}`,
      (error, status) => usersPage("ERASED", { error }, status), "That wasn't done.");
  },
});
