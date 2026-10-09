import route from "primate/route";
import { admin, notFound } from "#lib/admin.ts";
import { at, doneSaying } from "#lib/tags-admin.ts";
import { tagsPage } from "#lib/tags-pages.ts";

export default route({
  get(request) {
    if (!admin()) return notFound();
    return tagsPage(at("feed", request.query.try("status"), request.query.try("page")), { said: doneSaying(request.url.searchParams) });
  },
});
