import Session from "@/stores/Session";
import { sweep } from "#auth/sessions.ts";
import { validZone, withZone, ZONE_COOKIE } from "#lib/zone.ts";

/* Every request: at most once an hour, old sessions are cleared out (src/auth/sessions.ts), in
   the background, so no request waits on it and a failure only costs a log line. And the reader's
   time zone, from the cookie client/zone.ts sets, is kept for the request (src/lib/zone.ts). */
const HOUR = 60 * 60 * 1000;
let lastSwept = 0;

export default function clearOutSessions(request: any, next: (request: any) => any) {
  const now = Date.now();
  if (now - lastSwept >= HOUR) {
    lastSwept = now;
    sweep(Session).catch((e) => console.warn(`Clearing out old sessions failed: ${e?.message ?? e}`));
  }
  const zone = validZone(request.cookies?.try?.(ZONE_COOKIE));
  return withZone(zone, () => next(request));
}
