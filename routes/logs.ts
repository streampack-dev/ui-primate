import route from "primate/route";
import type { components } from "#api/schema.d.ts";
import { current, isAdmin } from "#auth/readers.ts";
import { formatDate } from "#lib/format.ts";
import { channels as listChannels, readLogs, type Channel } from "#lib/log-channels.ts";
import { lines, shiftDay, today, validDay } from "#lib/logs.ts";
import { view } from "#lib/view.ts";
import { notFound } from "#lib/post-page.ts";

type Day = components["schemas"]["LogDayResponse"];

/* Channel logs, as ui-nextjs shows them (/logs?provenance=…&day=…), drawn on the server. Some
   channels are public and some only for signed-in readers, so what a reader may see comes from
   the API as them (#lib/log-channels.ts), and a reader's page is private. IRC channels are listed
   unless an admin asks for all of them. A channel's day offers a search of it (/logs/search). */

const DAY_LABEL = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

export default route({
  async get(request) {
    const day = request.query.try("day") === undefined ? today() : validDay(request.query.try("day"));
    if (!day || day > today()) return notFound();
    const admin = isAdmin(current());
    const all = admin && request.query.try("all") !== undefined;
    const privately = current() ? { "Cache-Control": "private, no-store" } : {};

    let channels: Channel[];
    try {
      channels = await listChannels(all);
    } catch {
      return view("LogsUnavailable.marko", { meta: { title: "Logs Unavailable" } }, {
        status: 503, headers: privately,
      });
    }

    // Only a channel the reader is offered; else the first.
    const asked = request.query.try("provenance");
    const chosen = channels.find((c) => c.uri === asked) ?? channels[0] ?? null;
    const href = (uri: string, d: string) => `/logs?${new URLSearchParams({ provenance: uri, day: d, ...(all ? { all: "1" } : {}) })}`;

    let entries: ReturnType<typeof lines> = [];
    let failed = false;
    if (chosen) {
      try {
        entries = lines((await readLogs<Day>("/logs", { provenance: chosen.uri, day }))?.entries || []);
      } catch {
        failed = true;
      }
    }
    const next = shiftDay(day, 1);

    return view("Logs.marko", {
      day,
      dayLabel: DAY_LABEL(day),
      channels: channels.map((c) => ({ ...c, href: href(c.uri, day), current: c.uri === chosen?.uri })),
      chosen: chosen ? { uri: chosen.uri, name: chosen.name, href: href(chosen.uri, day) } : null,
      all,
      lines: entries,
      failed,
      prev: chosen ? href(chosen.uri, shiftDay(day, -1)) : null,
      next: chosen && next <= today() ? href(chosen.uri, next) : null,
      // An admin's way to every protocol's channels (and back).
      allToggle: admin ? { href: `/logs?${new URLSearchParams({ day, ...(all ? {} : { all: "1" }) })}`, all } : null,
      meta: { title: chosen ? `${chosen.name}, ${formatDate(`${day}T00:00:00Z`)}` : "Chat Logs", path: "/logs" },
    }, {
      headers: privately,
    });
  },
});
