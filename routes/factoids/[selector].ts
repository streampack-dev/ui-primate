import response from "primate/response";
import route from "primate/route";
import { send } from "#api/client.ts";
import { refusal } from "#auth/forms.ts";
import { csrf, csrfOk, current, isAdmin } from "#auth/readers.ts";
import { asReader, bearer, SignInRequired } from "#auth/signed-in.ts";
import { factoidPage } from "#lib/factoid-pages.ts";
import { changes, factoidHref, isNew, knowledgeBase } from "#lib/factoids.ts";
import { notFound } from "#lib/post-page.ts";
import { pageAsked } from "#lib/post-rows.ts";
import { view } from "#lib/view.ts";

/* A factoid, its attributes as the bot says them; [[factoid]] links in posts come here. A signed-in
   reader changes it here (#170), as ui-pudl has it: its attributes (only what changed is sent, and
   an emptied field forgets that attribute), or forgets it, asked first; an admin locks and unlocks
   it. A missing one can be taught here. Everything is a plain form post, back to this page. */

function selectorOf(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const FORGET_BODY = "Its text and every other attribute go; the bot no longer knows it. Anyone signed in can teach it again.";

export default route({
  get(request) {
    const selector = selectorOf(request.path.get("selector"));
    // Forgetting is asked first, on a page of its own (client/confirm.ts shows it in a dialog).
    if (request.query.try("forget") !== undefined) {
      if (!current()) return notFound();
      return view("Confirm.marko", {
        title: `Forget “${selector}”?`,
        body: FORGET_BODY,
        action: factoidHref(selector), fields: { do: "forget" }, button: "Forget", back: factoidHref(selector), csrf: csrf(),
        meta: { title: "Forget factoid" },
      }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const back = knowledgeBase((request.query.try("q") || "").trim(), pageAsked(request.query.try("page")));
    return factoidPage(selector, back);
  },

  async post(request) {
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    const selector = selectorOf(request.path.get("selector"));
    const here = factoidHref(selector);
    const signIn = response.redirect(`/login?return=${encodeURIComponent(here)}`, 303);
    if (!current()) return signIn;
    const step = form.do || "save";
    if ((step === "lock" || step === "unlock") && !isAdmin(current())) return notFound();
    if (!["save", "forget", "lock", "unlock"].includes(step)) return notFound();

    const typed = Object.fromEntries(Object.entries(form).filter(([k]) => !k.startsWith("was.") && k !== "csrf" && k !== "do"));
    const again = (error: string, status = 400) => factoidPage(selector, "/factoids", { error, values: typed }, status);
    const path = `/factoids/${encodeURIComponent(selector)}`;

    let calls: ((access: string) => Promise<Response>)[];
    if (step === "forget") calls = [(a) => send("DELETE", path, undefined, bearer(a))];
    else if (step === "lock") calls = [(a) => send("PUT", `${path}/lock`, undefined, bearer(a))];
    else if (step === "unlock") calls = [(a) => send("DELETE", `${path}/lock`, undefined, bearer(a))];
    else {
      const changed = changes(form);
      if (isNew(form) && !changed.some((c) => c.name === "text" && c.value)) return again("A new factoid needs its text.");
      // The text first: for a new factoid, it's what creates it.
      calls = changed.sort((a, b) => Number(b.name === "text") - Number(a.name === "text")).map((c) => (a: string) => c.value
        ? send("PUT", path, { value: c.value, attribute: c.name }, bearer(a))
        : send("DELETE", `${path}?${new URLSearchParams({ attribute: c.name })}`, undefined, bearer(a)));
    }

    for (const call of calls) {
      let answer: Response;
      try {
        answer = await asReader(call);
      } catch (e) {
        if (e instanceof SignInRequired) return signIn;
        answer = new Response(null, { status: 503 });
      }
      if (answer.ok) continue;
      if (answer.status >= 500) return again("That change couldn't be made just now. Try again shortly; what you wrote is kept here.", 503);
      return again(await refusal(answer, "The news service didn't accept that. Try again in a moment."));
    }
    return response.redirect(step === "forget" ? "/factoids" : here, 303);
  },
});
