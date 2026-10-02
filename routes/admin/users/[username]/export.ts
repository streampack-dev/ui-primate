import response from "primate/response";
import route from "primate/route";
import { send } from "#api/client.ts";
import { asReader, bearer, SignInRequired } from "#auth/signed-in.ts";
import { admin, notFound, USERNAME } from "#lib/admin.ts";
import { usersPage } from "../../users.ts";

/* A user's data, the API's export for an admin's review, as a download. */
export default route({
  async get(request) {
    const who = request.path.get("username");
    if (!admin() || !USERNAME.test(who)) return notFound();
    let answer: Response;
    try {
      answer = await asReader((a) => send("GET", `/admin/users/${who}/export`, undefined, bearer(a)));
    } catch (e) {
      if (e instanceof SignInRequired) return response.redirect("/login?return=%2Fadmin%2Fusers", 303);
      answer = new Response(null, { status: 503 });
    }
    if (!answer.ok) return usersPage("ACTIVE", { error: `${who}'s data couldn't be exported just now.` }, 503);
    return new Response(await answer.arrayBuffer(), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="bytecode-news-${who}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  },
});
