import route from "primate/route";
import { admin, notFound } from "#lib/admin.ts";
import { at, doneSaying } from "#lib/tags-admin.ts";
import { tagsPage } from "#lib/tags-pages.ts";

/* The tag vocabulary's review queue (streampack#140): doubtful new tags, open first, twenty to a
   page, each to alias, split, keep or dismiss. The other sections are its own pages beside it. */
export default route({
  get(request) {
    if (!admin()) return notFound();
    return tagsPage(at("review", request.query.try("status"), request.query.try("page")), { said: doneSaying(request.url.searchParams) });
  },
});
