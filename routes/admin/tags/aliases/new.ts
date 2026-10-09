import route from "primate/route";
import { admin, notFound } from "#lib/admin.ts";
import { aliasQuestion } from "#lib/tags-asks.ts";
import { signedIn } from "#lib/tags-pages.ts";

/* A new alias, asked first: its fields as last checked, and what they would re-point, from the API's
   dry run. Confirm posts to /admin/tags/aliases. */
export default route({
  get(request) {
    if (!admin()) return notFound();
    return signedIn(request.target, () => aliasQuestion(request.query.try("alias"), request.query.try("tag")));
  },
});
