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
      title: `Suspend ${who}?`, body: `They can't sign in or post until they're unsuspended.`,
      action: `/admin/users/${who}/suspend`, button: "Suspend", back: "/admin/users",
    });
  },

  async post(request) {
    const who = request.path.get("username");
    if (!admin() || !USERNAME.test(who)) return notFound();
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    return act((a) => send("PUT", `/admin/users/${who}/suspend`, undefined, bearer(a)),
      `/admin/users?done=suspended&who=${who}`,
      (error, status) => usersPage("ACTIVE", { error }, status), "That wasn't done.");
  },
});
