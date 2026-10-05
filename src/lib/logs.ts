/* Channel logs, as ui-pudl's Logs.kt has them: a channel's name from its address, a day's lines
   with an anchor each, and a line's text as text and links, never markup. */

/** A channel's name, as ui-nextjs gives it: its address decoded, from the last `#` (`#java`), or after the last `/`. */
export function channelName(uri: string): string {
  const decoded = uri.replace(/%23/gi, "#");
  const hash = decoded.lastIndexOf("#");
  if (hash >= 0) return decoded.substring(hash);
  const slash = decoded.lastIndexOf("/");
  return slash >= 0 ? decoded.substring(slash + 1) : decoded;
}

export type Segment = { text: string; href?: string };

const WEB_ADDRESS = /https?:\/\/[^\s<>"]+/gi;
const TRAILING = ".,;:!?'\"";

/** [content] as text and links: web addresses become links, without trailing punctuation. */
export function segments(content: string): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const match of content.matchAll(WEB_ADDRESS)) {
    let url = match[0];
    while (url && (TRAILING.includes(url.at(-1)!) || (url.endsWith(")") && !url.includes("(")))) url = url.slice(0, -1);
    let href: string;
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname) continue;
      href = parsed.href;
    } catch {
      continue;
    }
    if (match.index! > at) out.push({ text: content.slice(at, match.index) });
    out.push({ text: url, href });
    at = match.index! + url.length;
  }
  if (at < content.length) out.push({ text: content.slice(at) });
  return out;
}

/**
 * Who a line is from, as it's shown: null for a line from no one (the API's "unknown", which joins
 * and parts have been logged as), and for an action or a channel event, whose text names them
 * already (`* ada waves`, `* ada joined #java`), so the name isn't shown twice.
 */
export function speaker(sender: string | null | undefined, content: string | null | undefined): string | null {
  if (!sender || sender === "unknown") return null;
  return (content || "").startsWith(`* ${sender} `) ? null : sender;
}

export type LogLine = { id: string; time: string; iso: string; sender: string | null; segments: Segment[]; outbound: boolean };

/** A day's lines, each anchored by its UTC time (`l-030405`); lines in the same second take -2, -3 and so on. */
export function lines(entries: { timestamp?: string; sender?: string; content?: string; direction?: string }[]): LogLine[] {
  const seen = new Map<string, number>();
  return entries.map((e, i) => {
    const when = e.timestamp ? new Date(e.timestamp) : null;
    const time = when && !Number.isNaN(when.getTime()) ? when.toISOString().slice(11, 19) : "";
    const base = time ? `l-${time.replaceAll(":", "")}` : `l-n${i}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return {
      id: n === 1 ? base : `${base}-${n}`,
      time,
      iso: e.timestamp || "",
      sender: speaker(e.sender, e.content),
      segments: segments(e.content || ""),
      outbound: e.direction === "OUTBOUND",
    };
  });
}

/** Today, in UTC: the logs' days are UTC's. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** [day] as yyyy-MM-dd, if it is one; null otherwise. */
export function validDay(day: unknown): string | null {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : null;
}

export function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
