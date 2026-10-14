import route from "primate/route";
import type { components } from "#api/schema.d.ts";
import { getAsReader } from "#auth/signed-in.ts";
import { admin, adminPage, notFound } from "#lib/admin.ts";
import { conversationOnly, filterParams, logHref, logZone, readLogs } from "#lib/log-channels.ts";
import { shiftDay, today, validDay } from "#lib/logs.ts";
import { channelFor, conversationLines, dayHref, doneSaying, shownLines, type LogDay } from "#lib/moderation.ts";

type PublicDay = components["schemas"]["LogDayResponse"];

/**
 * A channel's day as the admin sees it (streampack#150): every line, the hidden ones included and
 * marked, each to be hidden or unhidden. [extra] says what was just done, or why it wasn't. With
 * [conversation], what was said only (ui-pudl#202): the lines the public `events=none` day has, and
 * every hidden line; every line when the public day can't be read.
 */
export async function dayPage(provenance: string, day: string, extra: { said?: string; error?: string; checked?: string[]; note?: string } = {}, status = 200, conversation = false) {
  const channel = await channelFor(provenance);
  const zone = await logZone();
  let found: LogDay | null = null;
  let failed = false;
  try {
    found = await getAsReader<LogDay>("/admin/moderation/logs", { provenance, day });
  } catch {
    failed = true;
  }
  if (found && conversation) {
    let said: PublicDay | null = null;
    try {
      said = await readLogs<PublicDay>("/logs", { provenance, day, ...filterParams(true) });
    } catch {
      // Every line, rather than none.
    }
    found = { ...found, lines: conversationLines(found.lines || [], said?.entries ?? null) };
  }
  const next = shiftDay(day, 1);
  const choice = (c: boolean) => ({ label: c ? "Conversation only" : "Everything", href: dayHref(provenance, day, c), current: c === conversation });
  return adminPage("AdminModerationDay.marko", {
    failed,
    provenance,
    day,
    channel: channel.name,
    lines: shownLines(found?.lines || [], channel, zone),
    zone,
    publicHref: logHref(channel, day, false, conversation),
    conversation,
    filters: [choice(false), choice(true)],
    prev: dayHref(provenance, shiftDay(day, -1), conversation),
    next: next <= today(zone) ? dayHref(provenance, next, conversation) : null,
    ...extra,
  }, `${channel.name}, ${day}`, "/admin/moderation", failed ? 503 : status);
}

/** The provenance and day asked for, if they're a channel and a day; the day is today's when not given. */
export async function asked(provenance: string | undefined, day: string | undefined, events?: string): Promise<{ provenance: string; day: string; conversation: boolean } | null> {
  const uri = (provenance || "").trim();
  if (!uri || uri.length > 500) return null;
  const shown = day ? validDay(day) : today(await logZone());
  return shown ? { provenance: uri, day: shown, conversation: conversationOnly(events) } : null;
}

export default route({
  async get(request) {
    if (!admin()) return notFound();
    const at = await asked(request.query.try("provenance"), request.query.try("day"), request.query.try("events"));
    if (!at) return notFound();
    return dayPage(at.provenance, at.day, { said: doneSaying(request.query.try("done"), request.query.try("n")) }, 200, at.conversation);
  },
});
