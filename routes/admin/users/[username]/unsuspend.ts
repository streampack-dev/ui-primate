import route from "primate/route";
import { send } from "#api/client.ts";
import { csrfOk } from "#auth/readers.ts";
import { bearer } from "#auth/signed-in.ts";
import { act, admin, notFound, USERNAME } from "#lib/admin.ts";
import { usersPage } from "../../users.ts";

export default route({
  async post(request) {
    const who = request.path.get("username");
    if (!admin() || !USERNAME.test(who)) return notFound();
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    return act((a) => send("PUT", `/admin/users/${who}/unsuspend`, undefined, bearer(a)),
      `/admin/users?status=SUSPENDED&done=unsuspended&who=${who}`,
      (error, status) => usersPage("SUSPENDED", { error }, status), "That wasn't done.");
  },
});
