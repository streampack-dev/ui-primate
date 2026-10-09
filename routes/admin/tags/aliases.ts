import route from "primate/route";
import { send } from "#api/client.ts";
import { csrfOk } from "#auth/readers.ts";
import { bearer } from "#auth/signed-in.ts";
import { act, admin, notFound } from "#lib/admin.ts";
import { aliasQuestion } from "#lib/tags-asks.ts";
import { at, doneHref, doneSaying, type ChangeResult } from "#lib/tags-admin.ts";
import { signedIn, tagsPage } from "#lib/tags-pages.ts";

/* Every alias, and a new one: asked first (aliases/new), with what it would re-point, and made by
   that question's Confirm, posted here. */
export default route({
  get(request) {
    if (!admin()) return notFound();
    return tagsPage(at("aliases", null, null), { said: doneSaying(request.url.searchParams) });
  },

  async post(request) {
    if (!admin()) return notFound();
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    const alias = (form.alias || "").trim();
    const tag = (form.tag || "").trim();
    const again = (error: string, status: number) => signedIn("/admin/tags/aliases", () => aliasQuestion(alias, tag, { error }, status));
    if (!alias || !tag) return again("Name both the alias and the tag it means.", 400);
    return act((a) => send("POST", "/admin/tags/aliases", { alias, tag }, bearer(a)), async (answer) => {
      let r: ChangeResult | null = null;
      try {
        r = await answer.json() as ChangeResult;
      } catch {
        // Done all the same.
      }
      return doneHref(at("aliases", null, null), "aliased", r?.tag ?? alias, r?.now ?? [tag], r && typeof r.posts === "number" ? r : undefined);
    }, again, "The alias wasn't added.");
  },
});
