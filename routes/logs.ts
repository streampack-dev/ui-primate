import response from "primate/response";
import route from "primate/route";
import { conversationOnly, logHref, logZone } from "#lib/log-channels.ts";
import { browsable, everyProtocol, logPage } from "#lib/log-pages.ts";
import { today, validDay } from "#lib/logs.ts";
import { notFound } from "#lib/post-page.ts";

/* Channel logs (/logs?provenance=…&day=…), the query form the readable addresses replace (#16):
   a channel that has one (/logs/irc/libera/java) is sent there for good, so old links keep
   working. Without a channel it's the first listed; without a day, today. */
export default route({
  async get(request) {
    const asked = request.query.try("day");
    const day = asked === undefined ? null : validDay(asked);
    if (asked !== undefined && (!day || day > today(await logZone()))) return notFound();
    const all = everyProtocol(request.query.try("all"));
    const provenance = request.query.try("provenance") || null;
    // Only what was said (`?events=none`, ui-pudl#202), kept on the way to the readable address.
    const conversation = conversationOnly(request.query.try("events"));

    if (provenance) {
      const channel = (await browsable())?.find((c) => c.uri === provenance);
      if (channel?.path) return response.redirect(logHref(channel, day, all, conversation), 301);
    }
    return logPage(provenance, day, all, conversation);
  },
});
