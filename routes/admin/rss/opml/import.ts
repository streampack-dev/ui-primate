import response from "primate/response";
import route from "primate/route";
import { send } from "#api/client.ts";
import { refusal } from "#auth/forms.ts";
import { csrfOk } from "#auth/readers.ts";
import { asReader, bearer, SignInRequired } from "#auth/signed-in.ts";
import { admin, notFound } from "#lib/admin.ts";
import { dashboard } from "../../../admin.ts";

/* RSS feeds imported from what's pasted: OPML, or a list of feed addresses, one to a line. */
export default route({
  async post(request) {
    if (!admin()) return notFound();
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    const payload = (form.payload || "").trim();
    if (!payload) return dashboard({ error: "Paste OPML or feed addresses before importing." }, 400);
    const contentType = payload.startsWith("<") ? "application/xml" : "text/plain";

    let answer: Response;
    try {
      answer = await asReader((a) => send("POST", "/admin/rss/opml/import", undefined, { ...bearer(a), Accept: "application/json" }, { raw: payload, contentType }));
    } catch (e) {
      if (e instanceof SignInRequired) return response.redirect("/login?return=%2Fadmin", 303);
      return dashboard({ payload, error: "The feeds couldn't be imported just now. Try again shortly." }, 503);
    }
    if (!answer.ok) return dashboard({ payload, error: await refusal(answer, "The feeds weren't imported.") }, answer.status >= 500 ? 503 : 400);
    const body = await answer.json().catch(() => null) as { message?: string } | null;
    return dashboard({ said: body?.message?.trim() || "Import complete." });
  },
});
