import response from "primate/response";
import route from "primate/route";
import { send } from "#api/client.ts";
import { csrfOk, signOut, tokens } from "#auth/readers.ts";

/* Revokes the reader's tokens at the API, then ends their session, whatever the API says. */
export default route({
  async post(request) {
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    const t = tokens();
    if (t) {
      try {
        await send("POST", "/auth/logout", undefined, { Authorization: `Bearer ${t.access}`, ...(t.refresh ? { Cookie: `refresh_token=${t.refresh}` } : {}) });
      } catch {
        // Signed out here regardless.
      }
    }
    signOut();
    return response.redirect("/", 303);
  },
});
