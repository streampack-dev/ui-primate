import route from "primate/route";
import { png, siteImage } from "#og/served.ts";

/* The site's link-preview card: every page without its own names it (src/lib/meta.ts). */
export default route({
  async get(request) {
    return png(await siteImage(), request.headers.try("if-none-match"));
  },
});
