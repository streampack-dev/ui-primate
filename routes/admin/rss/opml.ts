import response from "primate/response";
import route from "primate/route";
import { send } from "#api/client.ts";
import { asReader, bearer, SignInRequired } from "#auth/signed-in.ts";
import { admin, notFound } from "#lib/admin.ts";
import { dashboard } from "../../admin.ts";

/* The active RSS feeds as OPML, the API's, passed through as a download. */
export default route({
  async get() {
    if (!admin()) return notFound();
    let answer: Response;
    try {
      answer = await asReader((a) => send("GET", "/admin/rss/opml", undefined, { ...bearer(a), Accept: "application/xml, text/x-opml, */*" }));
    } catch (e) {
      if (e instanceof SignInRequired) return response.redirect("/login?return=%2Fadmin", 303);
      answer = new Response(null, { status: 503 });
    }
    if (!answer.ok) return dashboard({ error: "The feeds couldn't be exported just now. Try again shortly." }, 503);
    return new Response(await answer.arrayBuffer(), {
      headers: {
        "Content-Type": answer.headers.get("content-type") || "application/xml",
        "Content-Disposition": 'attachment; filename="feeds.opml"',
        "Cache-Control": "private, no-store",
      },
    });
  },
});
