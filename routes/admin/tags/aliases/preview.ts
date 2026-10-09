import route from "primate/route";
import { admin, notFound } from "#lib/admin.ts";
import { aliasPreview } from "#lib/tags-asks.ts";
import { previewJson } from "#lib/tags-pages.ts";

/* What a new alias would re-point, as typed, for client/tag-ask.ts, from the API's dry run. A GET
   that changes nothing, so it needs no form token; admins only. */
export default route({
  get(request) {
    if (!admin()) return notFound();
    return previewJson(() => aliasPreview(request.query.try("alias") || "", request.query.try("tag") || ""));
  },
});
