import route from "primate/route";
import { send } from "#api/client.ts";
import { csrfOk } from "#auth/readers.ts";
import { bearer, getAsReader } from "#auth/signed-in.ts";
import { act, admin, confirmPage, notFound } from "#lib/admin.ts";
import { at, doneHref, q, type AliasEntry } from "#lib/tags-admin.ts";
import { signedIn, tagsPage } from "#lib/tags-pages.ts";

/* Removing an alias, asked first. Nothing is re-pointed back, so the API has nothing to preview:
   the question says what the alias means and that it will stop meaning it. */
const LIST = at("aliases", null, null);

export default route({
  get(request) {
    const alias = request.query.try("alias") || "";
    if (!admin() || !alias) return notFound();
    return signedIn(request.target, async () => {
      const found = ((await getAsReader<AliasEntry[]>("/admin/tags/aliases").catch(() => null)) || []).find((a) => a.alias === alias);
      if (!found) return notFound();
      return confirmPage({
        title: `Remove the alias ${q(found.alias)}?`,
        body: `Nothing is re-pointed back to it: ${q(found.alias)} no longer means ${q(found.tag)}, and writing it makes a tag of its own.`,
        action: "/admin/tags/aliases/remove", button: "Remove", back: "/admin/tags/aliases", fields: { alias: found.alias },
      });
    });
  },

  async post(request) {
    if (!admin()) return notFound();
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    const alias = form.alias || "";
    if (!alias) return tagsPage(LIST, { error: "Which alias? None was named." }, 400);
    return act((a) => send("DELETE", `/admin/tags/aliases?${new URLSearchParams({ alias })}`, undefined, bearer(a)), async (answer) => {
      let gone: Partial<AliasEntry> = {};
      try {
        gone = await answer.json() as AliasEntry;
      } catch {
        // Done all the same.
      }
      return doneHref(LIST, "unaliased", gone.alias ?? alias, gone.tag ? [gone.tag] : []);
    }, (error, status) => tagsPage(LIST, { error }, status), "The alias wasn't removed.");
  },
});
