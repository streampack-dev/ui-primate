import route from "primate/route";
import { forwardedXml } from "#lib/forwarded.ts";

/* The site's Atom feed, as ui-pudl serves it: the API's, its links on the reader's host (src/lib/forwarded.ts). */
export default route({
  get(request) {
    return forwardedXml(request, "/feed.atom", "The feed is unavailable just now.");
  },
});
