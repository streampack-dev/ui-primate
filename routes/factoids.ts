import response from "primate/response";
import route from "primate/route";
import { send } from "#api/client.ts";
import { refusal } from "#auth/forms.ts";
import { csrfOk, current } from "#auth/readers.ts";
import { asReader, bearer, SignInRequired } from "#auth/signed-in.ts";
import { knowledgeBasePage } from "#lib/factoid-pages.ts";
import { factoidHref } from "#lib/factoids.ts";
import { pageAsked } from "#lib/post-rows.ts";

/* The knowledge base, as ui-nextjs has it: the factoids, searchable, twenty to a page. A signed-in
   reader teaches a new one here (#170): its name and text, then the rest on its page. */
export default route({
  get(request) {
    return knowledgeBasePage((request.query.try("q") || "").trim(), pageAsked(request.query.try("page")));
  },

  async post(request) {
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    if (!current()) return response.redirect(`/login?return=${encodeURIComponent("/factoids")}`, 303);
    const selector = (form.selector || "").trim();
    const text = (form.text || "").trim();
    const again = (error: string, status = 400) => knowledgeBasePage("", 0, { error, selector, values: { text: form.text || "" } }, status);
    if (!selector) return again("A factoid needs a name.");
    if (!text) return again("A new factoid needs its text.");

    let answer: Response;
    try {
      answer = await asReader((a) => send("PUT", `/factoids/${encodeURIComponent(selector)}`, { value: text, attribute: "text" }, bearer(a)));
    } catch (e) {
      if (e instanceof SignInRequired) return response.redirect(`/login?return=${encodeURIComponent("/factoids")}`, 303);
      answer = new Response(null, { status: 503 });
    }
    if (answer.ok) return response.redirect(factoidHref(selector), 303);
    if (answer.status >= 500) return again("The factoid couldn't be taught just now. Try again shortly; what you wrote is kept here.", 503);
    return again(await refusal(answer, "The news service didn't accept that. Try again in a moment."));
  },
});
