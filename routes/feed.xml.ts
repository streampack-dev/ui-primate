import route from "primate/route";
import { forwardedXml } from "#lib/forwarded.ts";

/* The site's feed: the API's, its links pointing at where the reader is (src/lib/forwarded.ts). */
export default route({
  get(request) {
    return forwardedXml(request, "/feed.xml", "The feed is unavailable just now.");
  },
});
