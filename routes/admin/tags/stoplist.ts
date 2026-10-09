import route from "primate/route";
import { send } from "#api/client.ts";
import { csrfOk } from "#auth/readers.ts";
import { bearer } from "#auth/signed-in.ts";
import { act, admin, notFound } from "#lib/admin.ts";
import { at, doneHref, doneSaying, type StopEntry } from "#lib/tags-admin.ts";
import { tagsPage } from "#lib/tags-pages.ts";

/* The stoplist: terms dropped from tags written from now on. Adding one is done at once. */
const LIST = at("stoplist", null, null);

export default route({
  get(request) {
    if (!admin()) return notFound();
    return tagsPage(LIST, { said: doneSaying(request.url.searchParams) });
  },

  async post(request) {
    if (!admin()) return notFound();
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    const term = (form.term || "").trim();
    if (!term) return tagsPage(LIST, { error: "Name the term to stoplist." }, 400);
    return act((a) => send("POST", "/admin/tags/stoplist", { term }, bearer(a)), async (answer) => {
      let added: Partial<StopEntry> = {};
      try {
        added = await answer.json() as StopEntry;
      } catch {
        // Done all the same.
      }
      return doneHref(LIST, "stopped", added.term ?? term);
    }, (error, status) => tagsPage(LIST, { error, term }, status), "The term wasn't stoplisted.");
  },
});
