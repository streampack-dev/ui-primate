import route from "primate/route";
import { send } from "#api/client.ts";
import { csrfOk } from "#auth/readers.ts";
import { bearer } from "#auth/signed-in.ts";
import { act, admin, notFound } from "#lib/admin.ts";
import { backTo, doneHref, q, type FeedTag } from "#lib/tags-admin.ts";
import { tagsPage } from "#lib/tags-pages.ts";

/* A waiting feed tag's decision, done at once: mapped to an existing tag (an alias), created as a
   tag, or ignored (stoplisted). Back to the list it was decided from, saying what the API did. */
const DONE = { map: "mapped", create: "created", ignore: "ignored" } as const;

export default route({
  async post(request) {
    const action = request.path.get("action") as keyof typeof DONE;
    if (!admin() || !(action in DONE)) return notFound();
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    const back = backTo("feed", form.back);
    const name = (form.name || "").trim();
    if (!name) return tagsPage(back, { error: "Which feed tag? None was named." }, 400);
    const tag = (form.tag || "").trim();
    if (action === "map" && !tag) return tagsPage(back, { error: `Name the tag to map ${q(name)} to.` }, 400);
    const body = action === "map" ? { name, tag } : { name };
    return act((a) => send("POST", `/admin/rss/tags/${action}`, body, bearer(a)), async (answer) => {
      let decided: Partial<FeedTag> = {};
      try {
        decided = await answer.json() as FeedTag;
      } catch {
        // Done all the same.
      }
      const became = decided.tag ?? (action === "map" ? tag : action === "create" ? decided.name ?? name : null);
      return doneHref(back, DONE[action], decided.name ?? name, became ? [became] : []);
    }, (error, status) => tagsPage(back, { error }, status), "The feed tag wasn't decided.");
  },
});
