import route from "primate/route";
import { forwardedXml } from "#lib/forwarded.ts";

/* The podcast (#33): the API's feed of the posts with recordings, its links pointing at where the
   reader is, as the site's feed has them (src/lib/forwarded.ts). The recordings' own addresses are
   the API's, on its origin, which the rewriting leaves alone. */
export default route({
  get(request) {
    return forwardedXml(request, "/podcast.xml", "The podcast feed is unavailable just now.");
  },
});
