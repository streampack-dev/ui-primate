import route from "primate/route";
import { siteUrl } from "#lib/meta.ts";

/* What crawlers may visit (#72). Everything is open, the logs and their filters included (they're
   shared, and canonical), except pages with nothing to index where a crawler can loop: signing in,
   the editor and the admin's pages, a reader's profile, search results (each channel's too: the major crawlers read the *), the card gallery, and the
   forms. No crawler is named, so none is turned away, language models' included (#73's llms.txt is
   for them). */
const DISALLOWED = ["/login", "/logout", "/edit/", "/admin", "/profile", "/search", "/logs/search", "/logs/*/search", "/og-preview", "/submit", "/comments/"];

export default route({
  get() {
    const body = ["User-agent: *", ...DISALLOWED.map((path) => `Disallow: ${path}`), "", `Sitemap: ${siteUrl()}/sitemap.xml`, ""].join("\n");
    return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
  },
});
