import response from "primate/response";
import route from "primate/route";
import { send } from "#api/client.ts";
import { refusal } from "#auth/forms.ts";
import { csrfOk } from "#auth/readers.ts";
import { asReader, bearer, SignInRequired } from "#auth/signed-in.ts";
import { admin, notFound } from "#lib/admin.ts";
import { backTo, CLEAR, isRating, itemAnchor, ratingSaid } from "#lib/rss-ratings.ts";
import { view } from "#lib/view.ts";

/* An admin rates an RSS item from the reader (#27): rating=RATES, MIGHT or DULL sets it (PUT), and
   rating=NONE, which the button already pressed sends, clears it (DELETE). A plain form goes back to
   the reader as it was (`back`) at the item (#item-<id>); client/rate.ts asks for JSON instead and
   redraws the buttons in place. Anyone but an admin finds nothing here, and the API isn't asked. */
const ID = /^[0-9a-f-]{36}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });

export default route({
  async post(request) {
    const id = request.path.get("id");
    if (!admin() || !ID.test(id)) return notFound();
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    const wantsJson = (request.headers.try("accept") || "").includes("application/json");
    const back = backTo(form.back);
    const at = `${back}#${itemAnchor(id)}`;
    const rating = form.rating;
    const refused = (said: string, status: number) => wantsJson
      ? json({ error: said }, status)
      : view("RssRateRefused.marko", { said, back: at, meta: { title: "Not Rated", robots: "noindex, nofollow" } }, { status, headers: { "Cache-Control": "private, no-store" } });
    if (rating !== CLEAR && !isRating(rating)) return refused("Rate it Rates, Might or Dull.", 400);

    let answer: Response;
    try {
      answer = await asReader((a) => rating === CLEAR
        ? send("DELETE", `/admin/rss/items/${id}/rating`, undefined, bearer(a))
        : send("PUT", `/admin/rss/items/${id}/rating`, { rating }, bearer(a)));
    } catch (e) {
      if (e instanceof SignInRequired) {
        return wantsJson ? json({ error: "Sign in again to rate items." }, 401) : response.redirect(`/login?return=${encodeURIComponent(back)}`, 303);
      }
      return refused("The rating wasn't saved: the site couldn't be reached. Try again shortly.", 503);
    }
    if (answer.status === 404) return refused("That item isn't stored any more.", 404);
    if (!answer.ok) return refused(await refusal(answer, "The rating wasn't saved."), answer.status >= 500 ? 503 : 400);

    let saved: { rating?: string | null; ratedBy?: string | null } = {};
    if (rating !== CLEAR) {
      try {
        saved = await answer.json();
      } catch {
        saved = { rating };
      }
    }
    if (!wantsJson) return response.redirect(at, 303);
    const now = rating === CLEAR ? null : saved.rating ?? rating;
    return json({ itemId: id, rating: now, ratedBy: now ? saved.ratedBy ?? null : null, said: ratingSaid(now, saved.ratedBy) });
  },
});
