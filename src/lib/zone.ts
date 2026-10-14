/* The reader's time zone, for times shown and entered (#35): the API keeps and takes UTC, and the
   reader sees and types their own zone's time.

   client/zone.ts puts the browser's zone in a cookie, which every request reads (routes/+hook.ts)
   and this keeps for the request. Without it (a first visit, or no script) times are given in UTC,
   saying so, and the script rewrites each one marked data-local into the browser's zone. */
import { AsyncLocalStorage } from "node:async_hooks";

export const ZONE_COOKIE = "bcn-tz";

/**
 * [zone] if it's an IANA zone this runtime knows, as given (ICU's own spelling can be an old one:
 * Asia/Calcutta for Asia/Kolkata); null for anything else.
 */
export function validZone(zone: string | null | undefined): string | null {
  if (!zone || zone.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(zone)) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

const kept = new AsyncLocalStorage<string>();

/** Runs [run] with [zone] as the reader's, UTC when it's null. */
export const withZone = <T>(zone: string | null, run: () => T): T => kept.run(zone ?? "UTC", run);

/** The reader's zone for this request: their browser's, else UTC. */
export const readerZone = (): string => kept.getStore() ?? "UTC";

type Wall = { year: number; month: number; day: number; hour: number; minute: number };

/** The wall clock in [zone] at [instant] (ms), to the minute. */
function wallAt(instant: number, zone: string): Wall {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour, minute: +parts.minute };
}

const asUtc = (w: Wall) => Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);

/** How far [zone] is ahead of UTC at [instant], in ms. */
const offsetAt = (instant: number, zone: string) => asUtc(wallAt(instant, zone)) - Math.floor(instant / 60_000) * 60_000;

const FIELD = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * A datetime-local value ("2026-10-20T09:00") read as [zone]'s wall clock, as an instant; null for a
 * value that isn't one. A time that happens twice (clocks going back) is the first; one that never
 * happens (clocks going forward) is moved on by the gap, as the clocks were: 02:30 on a spring-forward
 * night in New York is 03:30.
 */
export function fromZoned(value: string, zone: string): Date | null {
  const m = FIELD.exec(value);
  if (!m) return null;
  const wall = { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5] };
  const local = asUtc(wall);
  if (Number.isNaN(local)) return null;
  const check = new Date(local);
  if (check.getUTCMonth() + 1 !== wall.month || check.getUTCDate() !== wall.day || wall.hour > 23 || wall.minute > 59) return null;
  // The offsets either side of any change that night.
  const before = offsetAt(local - 86_400_000, zone);
  const after = offsetAt(local + 86_400_000, zone);
  const found = [local - before, local - after].filter((t) => asUtc(wallAt(t, zone)) === local).sort((a, b) => a - b);
  return new Date(found[0] ?? local - before);
}

/** [iso] as a datetime-local value on [zone]'s wall clock; empty for none. */
export function toZoned(iso: string | null | undefined, zone: string): string {
  if (!iso) return "";
  const instant = new Date(iso).getTime();
  if (Number.isNaN(instant)) return "";
  const w = wallAt(instant, zone);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${w.year}-${two(w.month)}-${two(w.day)}T${two(w.hour)}:${two(w.minute)}`;
}

/** [zone]'s short name at [instant]: "EDT", "GMT+5:30", "UTC". */
export function zoneName(instant: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(instant)
    .find((p) => p.type === "timeZoneName")?.value ?? zone;
}
