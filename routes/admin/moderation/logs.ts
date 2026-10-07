import route from "primate/route";
import { getAsReader } from "#auth/signed-in.ts";
import { admin, adminPage, notFound } from "#lib/admin.ts";
import { logHref } from "#lib/log-channels.ts";
import { shiftDay, today, validDay } from "#lib/logs.ts";
import { channelFor, dayHref, doneSaying, shownLines, type LogDay } from "#lib/moderation.ts";

/**
 * A channel's day as the admin sees it (streampack#150): every line, the hidden ones included and
 * marked, each to be hidden or unhidden. [extra] says what was just done, or why it wasn't.
 */
export async function dayPage(provenance: string, day: string, extra: { said?: string; error?: string; checked?: string[]; note?: string } = {}, status = 200) {
  const channel = await channelFor(provenance);
  let found: LogDay | null = null;
  let failed = false;
  try {
    found = await getAsReader<LogDay>("/admin/moderation/logs", { provenance, day });
  } catch {
    failed = true;
  }
  const next = shiftDay(day, 1);
  return adminPage("AdminModerationDay.marko", {
    failed,
    provenance,
    day,
    channel: channel.name,
    lines: shownLines(found?.lines || [], channel),
    publicHref: logHref(channel, day),
    prev: dayHref(provenance, shiftDay(day, -1)),
    next: next <= today() ? dayHref(provenance, next) : null,
    ...extra,
  }, `${channel.name}, ${day}`, "/admin/moderation", failed ? 503 : status);
}

/** The provenance and day asked for, if they're a channel and a day; the day is today's when not given. */
export function asked(provenance: string | undefined, day: string | undefined): { provenance: string; day: string } | null {
  const uri = (provenance || "").trim();
  if (!uri || uri.length > 500) return null;
  const shown = day ? validDay(day) : today();
  return shown ? { provenance: uri, day: shown } : null;
}

export default route({
  get(request) {
    if (!admin()) return notFound();
    const at = asked(request.query.try("provenance"), request.query.try("day"));
    if (!at) return notFound();
    return dayPage(at.provenance, at.day, { said: doneSaying(request.query.try("done"), request.query.try("n")) });
  },
});
