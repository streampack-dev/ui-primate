import route from "primate/route";
import { forwardedXml } from "#lib/forwarded.ts";

/* The site's sitemap: the API's, its addresses this site's (src/lib/forwarded.ts), as ui-nextjs
   serves it. */
export default route({
  get(request) {
    return forwardedXml(request, "/sitemap.xml", "The sitemap is unavailable just now.");
  },
});
