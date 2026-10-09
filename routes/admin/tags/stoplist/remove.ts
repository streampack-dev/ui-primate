import route from "primate/route";
import { send } from "#api/client.ts";
import { csrfOk } from "#auth/readers.ts";
import { bearer } from "#auth/signed-in.ts";
import { act, admin, notFound } from "#lib/admin.ts";
import { at, doneHref, type StopEntry } from "#lib/tags-admin.ts";
import { tagsPage } from "#lib/tags-pages.ts";

/* Taking a term off the stoplist, done at once. */
const LIST = at("stoplist", null, null);

export default route({
  async post(request) {
    if (!admin()) return notFound();
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    const term = form.term || "";
    if (!term) return tagsPage(LIST, { error: "Which term? None was named." }, 400);
    return act((a) => send("DELETE", `/admin/tags/stoplist?${new URLSearchParams({ term })}`, undefined, bearer(a)), async (answer) => {
      let gone: Partial<StopEntry> = {};
      try {
        gone = await answer.json() as StopEntry;
      } catch {
        // Done all the same.
      }
      return doneHref(LIST, "unstopped", gone.term ?? term);
    }, (error, status) => tagsPage(LIST, { error }, status), "The term wasn't taken off the stoplist.");
  },
});
