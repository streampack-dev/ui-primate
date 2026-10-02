import route from "primate/route";
import { send } from "#api/client.ts";
import { csrfOk } from "#auth/readers.ts";
import { bearer } from "#auth/signed-in.ts";
import { act, admin, notFound, USERNAME } from "#lib/admin.ts";
import { ROLES, usersPage } from "../../users.ts";

export default route({
  async post(request) {
    const who = request.path.get("username");
    if (!admin() || !USERNAME.test(who)) return notFound();
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    if (!(ROLES as readonly string[]).includes(form.newRole)) return usersPage("ACTIVE", { error: "Choose one of the roles offered." }, 400);
    return act((a) => send("PUT", `/admin/users/${who}/role`, { newRole: form.newRole }, bearer(a)),
      `/admin/users?done=role&who=${who}`,
      (error, status) => usersPage("ACTIVE", { error }, status), "The role wasn't changed.");
  },
});
