import route from "primate/route";
import { admin, notFound } from "#lib/admin.ts";
import { ASKED, ID, reviewPreview, type ReviewAction } from "#lib/tags-asks.ts";
import { previewJson } from "#lib/tags-pages.ts";

/* What an alias or split would do with the field as typed, for client/tag-ask.ts, from the API's dry
   run: {"ok":true,"text":"This re-points 3 posts and 1 factoid to “compilers”.","button":"Alias to “compilers”"}.
   A GET that changes nothing, so it needs no form token; admins only. */
export default route({
  get(request) {
    const id = request.path.get("id");
    const action = request.path.get("action") as ReviewAction;
    if (!admin() || !ID.test(id) || !(ASKED as readonly string[]).includes(action)) return notFound();
    return previewJson(() => reviewPreview(id, action, request.query.try(action === "alias" ? "tag" : "parts") || ""));
  },
});
