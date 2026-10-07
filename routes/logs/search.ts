import response from "primate/response";
import route from "primate/route";
import { searchHref } from "#lib/log-channels.ts";
import { browsable, everyProtocol, searchPage } from "#lib/log-pages.ts";
import { notFound } from "#lib/post-page.ts";
import { view } from "#lib/view.ts";
import { current } from "#auth/readers.ts";

/* Searching one channel's logs (#4) by the query form (/logs/search?provenance=…). A channel with a
   readable address (#16) is sent to its own search (/logs/irc/libera/java/search?q=…) for good. */
export default route({
  async get(request) {
    const provenance = request.query.try("provenance") || "";
    const q = (request.query.try("q") || "").trim();
    const from = (request.query.try("from") || "").trim();
    const asked = Number.parseInt(request.query.try("page") || "1", 10);
    const page = Number.isFinite(asked) && asked >= 1 ? asked : 1;
    const all = everyProtocol(request.query.try("all"));

    const offered = await browsable();
    if (!offered) {
      return view("LogsUnavailable.marko", { meta: { title: "Logs Unavailable" } }, { status: 503, headers: current() ? { "Cache-Control": "private, no-store" } : {} });
    }
    const channel = offered.find((c) => c.uri === provenance);
    if (!channel) return notFound();
    if (channel.path) {
      return response.redirect(searchHref(channel, { ...(q ? { q } : {}), ...(from ? { from } : {}), ...(page > 1 ? { page: String(page) } : {}) }, all), 301);
    }
    return searchPage(channel, q, from, page, all);
  },
});
