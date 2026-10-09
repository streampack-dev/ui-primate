import route from "primate/route";
import { send } from "#api/client.ts";
import { csrfOk } from "#auth/readers.ts";
import { bearer } from "#auth/signed-in.ts";
import { act, admin, notFound } from "#lib/admin.ts";
import { ASKED, ID, openEntry, reviewQuestion, type ReviewAction } from "#lib/tags-asks.ts";
import { backTo, doneHref, href, parts, type ChangeResult } from "#lib/tags-admin.ts";
import { signedIn, tagsPage } from "#lib/tags-pages.ts";

/* A review entry's actions. Alias and split are asked first, here by GET: the question, its field
   as last checked, and what it would do, from the API's dry run; Confirm posts here. Keep and
   dismiss are done at once, from the list. Each comes back to the list it was done from, saying
   what the API did, or draws its page again with the API's reason. */
const ACTIONS = ["alias", "split", "keep", "dismiss"] as const;
const DONE = { alias: "aliased", split: "split", keep: "kept", dismiss: "dismissed" } as const;

export default route({
  async get(request) {
    const id = request.path.get("id");
    const action = request.path.get("action") as ReviewAction;
    if (!admin() || !ID.test(id) || !(ASKED as readonly string[]).includes(action)) return notFound();
    const back = backTo("review", request.query.try("back"));
    return signedIn(request.target, async () => {
      const entry = await openEntry(id).catch(() => null);
      if (!entry) return notFound();
      return reviewQuestion(entry, action, request.query.try(action === "alias" ? "tag" : "parts"), back);
    });
  },

  async post(request) {
    const id = request.path.get("id");
    const action = request.path.get("action") as (typeof ACTIONS)[number];
    if (!admin() || !ID.test(id) || !(ACTIONS as readonly string[]).includes(action)) return notFound();
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    const back = backTo("review", form.back);

    let body: unknown;
    if (action === "alias" || action === "split") {
      const value = action === "alias" ? (form.tag || "").trim() : form.parts || "";
      const list = parts(value);
      const missing = action === "alias" ? (value ? "" : "Name the tag to alias it to.") : (list.length < 2 ? "Name at least two parts, separated by commas." : "");
      // Asked again, as it was left, saying why.
      const again = (error: string, status: number) => signedIn(href(back), async () => {
        const entry = await openEntry(id).catch(() => null);
        return entry ? reviewQuestion(entry, action, value, back, { error }, status) : tagsPage(back, { error }, status);
      });
      if (missing) return again(missing, 400);
      body = action === "alias" ? { tag: value } : { parts: list };
      return act((a) => send("POST", `/admin/tags/review/${id}/${action}`, body, bearer(a)), (answer) => done(answer, back, action),
        again, action === "alias" ? "The tag wasn't aliased." : "The tag wasn't split.");
    }
    return act((a) => send("POST", `/admin/tags/review/${id}/${action}`, undefined, bearer(a)), (answer) => done(answer, back, action),
      (error, status) => tagsPage(back, { error }, status), action === "keep" ? "The tag wasn't kept." : "The entry wasn't dismissed.");
  },
});

/** The list, saying what [action] did, as the API's answer counts it. */
async function done(answer: Response, back: ReturnType<typeof backTo>, action: (typeof ACTIONS)[number]) {
  let r: ChangeResult | null = null;
  try {
    r = await answer.json() as ChangeResult;
  } catch {
    // Done all the same.
  }
  const counted = action === "alias" || action === "split";
  return doneHref(back, DONE[action], r?.tag ?? "", counted ? r?.now ?? [] : [], counted && r && typeof r.posts === "number" ? r : undefined);
}
