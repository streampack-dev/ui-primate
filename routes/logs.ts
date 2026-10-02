import response from "primate/response";
import route from "primate/route";
import { cachedGet, send } from "#api/client.ts";
import type { components } from "#api/schema.d.ts";
import { current, isAdmin } from "#auth/readers.ts";
import { asReader, bearer, SignInRequired } from "#auth/signed-in.ts";
import { formatDate } from "#lib/format.ts";
import { channelName, lines, shiftDay, today, validDay } from "#lib/logs.ts";
import { meta } from "#lib/meta.ts";
import { notFound } from "#lib/post-page.ts";

type Channels = components["schemas"]["LogProvenanceListResponse"];
type Day = components["schemas"]["LogDayResponse"];

/* Channel logs, as ui-nextjs shows them (/logs?provenance=…&day=…), drawn on the server. Some
   channels are public and some only for signed-in readers, so what a reader may see comes from
   the API as them: signed in, with their token, uncached and private (so no one else is served
   their channels); signed out, anonymously and cached, as ui-pudl does. IRC channels are listed
   unless an admin asks for all of them. */

/** [path] from the API, as the signed-in reader when there is one; null for a 404. Throws when it can't be had. */
async function read<T>(path: string, query: Record<string, string>): Promise<T | null> {
  if (current()) {
    try {
      const answer = await asReader((a) => send("GET", `${path}?${new URLSearchParams(query)}`, undefined, bearer(a)));
      if (answer.status === 404) return null;
      if (!answer.ok) throw new Error(`${path}: ${answer.status}`);
      return await answer.json() as T;
    } catch (e) {
      // A reader whose sign-in has lapsed sees what anyone does.
      if (!(e instanceof SignInRequired)) throw e;
    }
  }
  return cachedGet<T>(path, query);
}

const DAY_LABEL = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

export default route({
  async get(request) {
    const day = request.query.try("day") === undefined ? today() : validDay(request.query.try("day"));
    if (!day || day > today()) return notFound();
    const admin = isAdmin(current());
    const all = admin && request.query.try("all") !== undefined;
    const privately = current() ? { "Cache-Control": "private, no-store" } : {};

    let channels: { uri: string; name: string; latest: string | null }[];
    try {
      const listed = await read<Channels>("/logs/provenances", {});
      channels = (listed?.provenances || [])
        .filter((c) => c.provenanceUri && (all || c.protocol?.toLowerCase() === "irc"))
        .map((c) => ({
          uri: c.provenanceUri!,
          name: channelName(c.provenanceUri!),
          latest: c.latestContentPreview ? `${c.latestSender ?? ""}: ${c.latestContentPreview}` : null,
        }));
    } catch {
      return response.view("LogsUnavailable.marko", {}, {
        status: 503, headers: privately, placeholders: { meta: meta({ title: "Logs Unavailable" }) },
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
        entries = lines((await read<Day>("/logs", { provenance: chosen.uri, day }))?.entries || []);
      } catch {
        failed = true;
      }
    }
    const next = shiftDay(day, 1);

    return response.view("Logs.marko", {
      day,
      dayLabel: DAY_LABEL(day),
      channels: channels.map((c) => ({ ...c, href: href(c.uri, day), current: c.uri === chosen?.uri })),
      chosen: chosen ? { name: chosen.name, href: href(chosen.uri, day) } : null,
      lines: entries,
      failed,
      prev: chosen ? href(chosen.uri, shiftDay(day, -1)) : null,
      next: chosen && next <= today() ? href(chosen.uri, next) : null,
      // An admin's way to every protocol's channels (and back).
      allToggle: admin ? { href: `/logs?${new URLSearchParams({ day, ...(all ? {} : { all: "1" }) })}`, all } : null,
    }, {
      headers: privately,
      placeholders: { meta: meta({ title: chosen ? `${chosen.name}, ${formatDate(`${day}T00:00:00Z`)}` : "Chat Logs", path: "/logs" }) },
    });
  },
});
