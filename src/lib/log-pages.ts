/* A channel's log for a day, and a search of it, drawn on the server: shared by the readable
   addresses (/logs/irc/libera/java, #16) and the query forms they replace (/logs?provenance=…,
   /logs/search?provenance=…). Some channels are public and some only for signed-in readers, so
   what a reader may see comes from the API as them (#lib/log-channels.ts), and a reader's page is
   private. IRC channels are listed unless an admin asks for all of them. */
import response from "primate/response";
import type { components } from "#api/schema.d.ts";
import { refusal } from "#auth/forms.ts";
import { current, isAdmin } from "#auth/readers.ts";
import { formatDate } from "#lib/format.ts";
import { askLogs, channels as listChannels, filterParams, logHref, logZone, readLogs, searchHref, type Channel } from "#lib/log-channels.ts";
import { anchorOf, isEvent, lines, segments, shiftDay, speaker, today } from "#lib/logs.ts";
import { dayHref } from "#lib/moderation.ts";
import { notFound } from "#lib/post-page.ts";
import { view } from "#lib/view.ts";
import { clockIn, readerClock } from "#lib/zone.ts";

type Day = components["schemas"]["LogDayResponse"];
type Found = components["schemas"]["LogSearchResponse"];

/* A day as the address gives it (yyyy-MM-dd), in words; which zone's day it is is said beside it. */
const DAY_LABEL = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const SHORT_DAY = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

/* A search: lines with the text (`q`, 3 to 200 characters, ignoring case), from someone (`from`, a
   nick), or both, newest first, fifty to a page. The API's refusals are shown in its words, and
   searches aren't cached: each is its own question, and the API limits them. */
const SIZE = 50;
const MIN_QUERY = 3;
const MAX_QUERY = 200;

const privately = () => (current() ? { "Cache-Control": "private, no-store" } : {});
const unavailable = () => view("LogsUnavailable.marko", { meta: { title: "Logs Unavailable" } }, { status: 503, headers: privately() });

/** Whether an admin asked for every protocol's channels. */
export function everyProtocol(asked: string | undefined): boolean {
  return isAdmin(current()) && asked !== undefined;
}

/** Every channel the reader may browse, for finding one by address; null when the API can't be had. */
export async function browsable(): Promise<Channel[] | null> {
  try {
    return await listChannels(true);
  } catch {
    return null;
  }
}

/**
 * The day page. [chosen] is the channel asked for (null for the first listed), [day] the day (null
 * for today, as an address without one means), [all] an admin's every-protocol listing, and
 * [conversation] only what was said, without joins, parts and the like (`events=none`, ui-pudl#202).
 */
export async function logPage(chosenUri: string | null, day: string | null, all: boolean, conversation = false) {
  const zone = await logZone();
  const shown = day ?? today(zone);
  const admin = isAdmin(current());
  let channels: Channel[];
  try {
    channels = await listChannels(all);
  } catch {
    return unavailable();
  }
  // The channel asked for, listed or not (a readable address reaches any channel the reader may
  // browse); else the first listed.
  let chosen = channels.find((c) => c.uri === chosenUri) ?? null;
  if (!chosen && chosenUri) chosen = (await browsable())?.find((c) => c.uri === chosenUri) ?? null;
  chosen ??= channels[0] ?? null;

  let entries: ReturnType<typeof lines> = [];
  let failed = false;
  if (chosen) {
    try {
      entries = lines((await readLogs<Day>("/logs", { provenance: chosen.uri, day: shown, ...filterParams(conversation) }))?.entries || [], zone);
    } catch {
      failed = true;
    }
  }
  const next = shiftDay(shown, 1);
  // Previous, next, the lines' own links and the channels keep the filter.
  const href = chosen ? logHref(chosen, shown, all, conversation) : null;
  // The filter's two choices: this same address, with and without it.
  const choice = (c: boolean) => ({ label: c ? "Conversation only" : "Everything", href: logHref(chosen!, day, all, c), current: c === conversation });

  return view("Logs.marko", {
    day: shown,
    // The day's zone said, the log's (#36): "(UTC)" from a server that doesn't name one.
    dayLabel: `${DAY_LABEL(shown)} (${zone})`,
    channels: channels.map((c) => ({ ...c, href: logHref(c, shown, all, conversation), current: c.uri === chosen?.uri })),
    chosen: chosen && href ? { uri: chosen.uri, name: chosen.name, href, path: chosen.path } : null,
    all,
    conversation,
    filters: chosen ? [choice(false), choice(true)] : [],
    lines: entries,
    failed,
    prev: chosen ? logHref(chosen, shiftDay(shown, -1), all, conversation) : null,
    next: chosen && next <= today(zone) ? logHref(chosen, next, all, conversation) : null,
    // An admin's way to every protocol's channels (and back).
    allToggle: admin ? { href: `/logs?${new URLSearchParams({ day: shown, ...(all ? {} : { all: "1" }), ...filterParams(conversation) })}`, all } : null,
    // An admin's way to this day with its hidden lines, to hide or unhide them (streampack#150).
    moderate: admin && chosen ? dayHref(chosen.uri, shown, conversation) : null,
    meta: {
      title: chosen ? `${chosen.name}, ${formatDate(`${shown}T00:00:00Z`)}${conversation ? ", conversation only" : ""}` : "Chat Logs",
      path: chosen?.path ? `/logs/${chosen.path}${day ? `/${day}` : ""}` : "/logs",
    },
  }, {
    headers: privately(),
  });
}

/**
 * A search of [channel]'s log for [q] and/or [from], page [page] (from 1); with [conversation], of
 * what was said only, as the filtered day it was asked from (ui-pudl#202), its lines linked filtered.
 */
export async function searchPage(channel: Channel, q: string, from: string, page: number, all: boolean, conversation = false) {
  // Nothing to look for: the channel's log.
  if (!q && !from) return response.redirect(logHref(channel, null, all, conversation), 303);

  const href = (n: number) => searchHref(channel, { ...(q ? { q } : {}), ...(from ? { from } : {}), ...filterParams(conversation), ...(n > 1 ? { page: String(n) } : {}) }, all);
  const zone = await logZone();
  const shown = {
    zone,
    channel: { name: channel.name, uri: channel.uri, href: logHref(channel, null, all, conversation), path: channel.path },
    all, conversation, q, from,
    heading: [q && `“${q}”`, from && `from ${from}`, `in ${channel.name}`, conversation && "(conversation only)"].filter(Boolean).join(" "),
    meta: { title: `Search ${channel.name}`, path: channel.path ? `/logs/${channel.path}/search` : "/logs", robots: "noindex" },
  };
  const refused = (notice: string, status: number) =>
    view("LogSearch.marko", { ...shown, notice, hits: [], summary: "", prev: null, next: null }, { status, headers: privately() });

  if (q && (q.length < MIN_QUERY || q.length > MAX_QUERY)) return refused(`Search for ${MIN_QUERY} to ${MAX_QUERY} characters.`, 400);

  let answer: Response;
  try {
    answer = await askLogs("/logs/search", { provenance: channel.uri, ...(q ? { q } : {}), ...(from ? { sender: from } : {}), ...filterParams(conversation), page: String(page - 1), size: String(SIZE) });
  } catch {
    return unavailable();
  }
  if (answer.status === 404) return notFound();
  if (!answer.ok) {
    if (answer.status >= 500) return unavailable();
    return refused(await refusal(answer, "That search didn't work."), answer.status);
  }
  const found = await answer.json() as Found;
  const total = Number(found.totalCount ?? 0);
  const hits = (found.hits || []).filter((h) => h.timestamp && !Number.isNaN(new Date(h.timestamp).getTime())).map((h, i) => {
    const at = new Date(h.timestamp!);
    // The day as the API gives it, in the log's zone (#36), as is the time shown.
    const clock = clockIn(at, zone);
    const day = h.day || clock.day;
    return {
      key: `${h.timestamp}-${i}`,
      // A line's anchor on its day's page is its second (#lib/logs.ts); of several in one second, the first.
      href: `${logHref(channel, day, all, conversation)}#${anchorOf(at)}`,
      iso: h.timestamp!,
      local: readerClock(h.timestamp),
      when: `${SHORT_DAY(day)}, ${clock.time.slice(0, 5)}`,
      sender: speaker(h.sender, h.content),
      segments: segments(h.content || ""),
      outbound: h.direction === "OUTBOUND",
      event: isEvent(h.kind),
    };
  });
  return view("LogSearch.marko", {
    ...shown,
    notice: "",
    hits,
    summary: `${total} line${total === 1 ? "" : "s"}`,
    prev: page > 1 ? href(page - 1) : null,
    next: page < Number(found.totalPages ?? 0) ? href(page + 1) : null,
  }, { headers: privately() });
}
