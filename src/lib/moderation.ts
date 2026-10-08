/* Moderation (streampack#150): the reports the abuse detector files on chat lines, and what an
   admin does about them: hiding lines from the public logs (and showing them again), purging them
   for good, or dismissing a report. Nothing is ever hidden by itself; every step is an admin's.
   The bot doesn't ban anyone: that stays with each channel's operators. */
import { send } from "#api/client.ts";
import type { components } from "#api/schema.d.ts";
import { bearer } from "#auth/signed-in.ts";
import { act } from "#lib/admin.ts";
import { channels as listChannels, logHref, searchHref, type Channel } from "#lib/log-channels.ts";
import { channelName, segments, speaker, type Segment } from "#lib/logs.ts";

export type Report = components["schemas"]["ReportSummary"];
export type ReportList = components["schemas"]["ReportListResponse"];
export type ReportDetail = components["schemas"]["ReportDetail"];
export type ModerationLine = components["schemas"]["ModerationLine"];
export type LogDay = components["schemas"]["ModerationLogDay"];
type ActionView = components["schemas"]["ModerationActionView"];

/** A report's or a line's id, as the API's addresses take it; anything else names nothing. */
export const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The statuses a list is filtered by, as the API takes them. */
export const STATUSES = ["open", "dismissed", "actioned"] as const;
export type Status = (typeof STATUSES)[number];

/** At most this many lines in one step, as the API takes them. */
const MAX_LINES = 500;
const MAX_NOTE = 1000;

const WHEN = (iso: string | null | undefined) => {
  if (!iso) return "";
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : `${at.toISOString().slice(0, 10)} ${at.toISOString().slice(11, 16)} UTC`;
};

/** From [start] to [end], the day said once when they share it. */
function span(start: string, end: string): string {
  const from = WHEN(start);
  const to = WHEN(end);
  if (!from || !to) return from || to;
  return from.slice(0, 10) === to.slice(0, 10) ? `${from.slice(0, 16)} to ${to.slice(11)}` : `${from} to ${to}`;
}

/** A channel for [uri]: the one the reader may browse (with its readable address), else one reached by the query form. */
export async function channelFor(uri: string): Promise<Channel> {
  try {
    const found = (await listChannels(true)).find((c) => c.uri === uri);
    if (found) return found;
  } catch {
    // The query form reaches it all the same.
  }
  return { uri, name: channelName(uri), latest: null, path: null };
}

/** The admin day view of [uri]'s [day]. */
export const dayHref = (uri: string, day: string) => `/admin/moderation/logs?${new URLSearchParams({ provenance: uri, day })}`;

/** A detector signal in words, as the pages show it: AIMED_HOSTILITY is "aimed hostility". */
export const signalLabel = (name: string) => name.toLowerCase().replaceAll("_", " ");

/** A line's anchor on its public day's page (#lib/logs.ts): its second. */
const anchor = (iso: string) => `l-${new Date(iso).toISOString().slice(11, 19).replaceAll(":", "")}`;

export type ShownLine = {
  id: string; time: string; iso: string; day: string; sender: string | null; segments: Segment[];
  outbound: boolean; hidden: boolean; flagged: boolean; cited: boolean; publicHref: string;
  /** Why a flagged line was flagged, in words; empty for other lines and older reports. */
  signals: string[];
  /** Whether the line alone weighed enough to hide (streampack#169): an aimed insult, personal
      details, a slur or a threat, not repetition, flood or untargeted swearing. False when unknown. */
  strong: boolean;
};

/** [lines] as they're shown, each with its way to the public log. */
export function shownLines(lines: ModerationLine[], channel: Channel): ShownLine[] {
  return lines.map((l) => {
    const valid = !Number.isNaN(new Date(l.timestamp).getTime());
    return {
      id: l.id,
      time: valid ? new Date(l.timestamp).toISOString().slice(11, 19) : "",
      iso: l.timestamp,
      day: l.day,
      sender: speaker(l.sender, l.content),
      segments: segments(l.content || ""),
      outbound: l.direction === "OUTBOUND",
      hidden: l.hidden,
      flagged: l.flagged,
      cited: l.cited,
      signals: l.flagged ? (l.signals || []).map(signalLabel) : [],
      strong: l.flagged && l.strong === true,
      publicHref: `${logHref(channel, l.day)}${valid ? `#${anchor(l.timestamp)}` : ""}`,
    };
  });
}

/** A report as a list or its page shows it. */
export function shownReport(r: Report) {
  const signals = Object.entries(r.signals || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    id: r.id,
    href: `/admin/moderation/${r.id}`,
    sender: r.sender,
    channel: channelName(r.provenanceUri),
    protocol: r.protocol,
    provenance: r.provenanceUri,
    status: r.status,
    score: Number.isFinite(r.score) ? r.score.toFixed(2) : "",
    signals: signals.map(([name, count]) => ({ name, label: signalLabel(name), count })),
    verdict: r.verdict
      ? { abusive: r.verdict.abusive, reason: r.verdict.reason || "", model: r.verdict.model || "" }
      : null,
    window: span(r.windowStart, r.windowEnd),
    windowStart: r.windowStart,
    created: WHEN(r.createdAt),
    createdAt: r.createdAt,
    acted: r.actedBy ? `${r.actedBy}${r.actedAt ? `, ${WHEN(r.actedAt)}` : ""}` : "",
  };
}

const VERBS: Record<ActionView["action"], string> = { HIDE: "Hid", UNHIDE: "Unhid", PURGE: "Purged", DISMISS: "Dismissed" };

/** A report's history, as it's shown: who did what, and when. */
export function shownActions(actions: ActionView[]) {
  return actions.map((a) => ({
    id: a.id,
    what: a.action === "DISMISS" ? "Dismissed the report" : `${VERBS[a.action] ?? a.action} ${a.lineIds.length} line${a.lineIds.length === 1 ? "" : "s"}`,
    actor: a.actor,
    when: WHEN(a.actedAt),
    at: a.actedAt,
    note: a.note || "",
  }));
}

/** The log search for [sender]'s lines in [channel]: the same channel only, as the API has no other. */
export const senderSearch = (channel: Channel, sender: string) => searchHref(channel, { from: sender });

/** What the pages say after a step, by the fixed code they're sent back with and the count changed. */
export function doneSaying(done: string | undefined, n: string | undefined): string | undefined {
  const count = /^\d{1,4}$/.test(n || "") ? Number(n) : null;
  const lines = count === null ? "" : ` ${count} line${count === 1 ? "" : "s"}`;
  switch (done) {
    case "hidden": return `Hid${lines}. They're gone from the public log, kept here.`;
    case "unhidden": return `Unhid${lines}. They're back in the public log.`;
    case "purged": return `Purged${lines} for good.`;
    case "dismissed": return "Dismissed the report.";
    default: return undefined;
  }
}

/** A posted form's fields: [lineIds] (each checked `line`, or a comma list in `lines`), the note, and the rest. */
export function readForm(entries: [string, string][]) {
  const one = (name: string) => entries.find(([k]) => k === name)?.[1] ?? "";
  const given = [
    ...entries.filter(([k]) => k === "line").map(([, v]) => v),
    ...one("lines").split(",").map((v) => v.trim()).filter(Boolean),
  ];
  const lineIds = [...new Set(given)].filter((id) => ID.test(id)).slice(0, MAX_LINES);
  const note = one("note").trim().slice(0, MAX_NOTE);
  return { lineIds, note, one };
}

/**
 * Posts [body] to the API's [path] as the admin; then to [back] with what was done ([done]) and how
 * many lines it changed, or [refused] draws the page again with the API's reason.
 */
export function moderate(path: string, body: unknown, back: string, done: string, refused: (reason: string, status: number) => unknown, fallback: string) {
  return act((a) => send("POST", path, body, bearer(a)), async (answer) => {
    let changed: number | null = null;
    try {
      const said = await answer.json() as { changed?: number };
      if (typeof said.changed === "number") changed = said.changed;
    } catch {
      // Done all the same.
    }
    const join = back.includes("?") ? "&" : "?";
    return `${back}${join}done=${done}${changed === null ? "" : `&n=${changed}`}`;
  }, refused, fallback);
}
