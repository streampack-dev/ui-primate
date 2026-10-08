import response from "primate/response";
import route from "primate/route";
import type { components } from "#api/schema.d.ts";
import { current } from "#auth/readers.ts";
import { conversationOnly, readLogs } from "#lib/log-channels.ts";
import { browsable, everyProtocol, logPage, searchPage } from "#lib/log-pages.ts";
import { today, validDay } from "#lib/logs.ts";
import { notFound } from "#lib/post-page.ts";
import { view } from "#lib/view.ts";

type Found = components["schemas"]["LogChannelResponse"];

/* A channel's log by its readable address (#16, streampack#147): /logs/irc/libera/java for today,
   /logs/irc/libera/java/2026-10-06 for a day, /logs/irc/libera/java/search?q=… to search it. The
   API says which addresses name which channels: an IRC name as written, then with #, then ##, so
   /logs/irc/libera/java is #java. Another spelling of a channel's address (%23java, JAVA) is sent
   to the one the API gives, for good; an address that names no channel the reader may browse is
   not found, as a hidden channel is. */

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export default route({
  async get(request) {
    const segments = request.path.get("path").split("/").filter(Boolean).map(decode);
    if (segments.length < 3 || segments.length > 4) return notFound();
    const [protocol, service, name, last] = segments;
    const search = last === "search";
    const day = last && !search ? validDay(last) : null;
    if (last && !search && (!day || day > today())) return notFound();
    const all = everyProtocol(request.query.try("all"));
    // Only what was said (`?events=none`, ui-pudl#202); anything else is the whole day, as without it.
    const conversation = conversationOnly(request.query.try("events"));

    const channels = await browsable();
    if (!channels) {
      return view("LogsUnavailable.marko", { meta: { title: "Logs Unavailable" } }, { status: 503, headers: current() ? { "Cache-Control": "private, no-store" } : {} });
    }
    const asked = [protocol, service, name].join("/");
    const channel = channels.find((c) => c.path && c.path.split("/").map(decode).join("/") === asked);

    if (!channel) {
      // Another spelling of a channel's address: the API knows which, and its address.
      const found = await readLogs<Found>(`/logs/channels/${[protocol, service, name].map(encodeURIComponent).join("/")}`, {});
      if (!found?.path || found.path.split("/").map(decode).join("/") === asked) return notFound();
      const query = request.url.search;
      return response.redirect(`/logs/${found.path}${day ? `/${day}` : ""}${search ? "/search" : ""}${query}`, 301);
    }

    if (search) {
      const q = (request.query.try("q") || "").trim();
      const from = (request.query.try("from") || "").trim();
      const page = Number.parseInt(request.query.try("page") || "1", 10);
      return searchPage(channel, q, from, Number.isFinite(page) && page >= 1 ? page : 1, all, conversation);
    }
    return logPage(channel.uri, day, all, conversation);
  },
});
