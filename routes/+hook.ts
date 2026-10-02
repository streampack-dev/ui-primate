import Session from "@/stores/Session";
import { sweep } from "#auth/sessions.ts";

/* Every request: at most once an hour, old sessions are cleared out (src/auth/sessions.ts), in
   the background, so no request waits on it and a failure only costs a log line. */
const HOUR = 60 * 60 * 1000;
let lastSwept = 0;

export default function clearOutSessions(request: any, next: (request: any) => any) {
  const now = Date.now();
  if (now - lastSwept >= HOUR) {
    lastSwept = now;
    sweep(Session).catch((e) => console.warn(`Clearing out old sessions failed: ${e?.message ?? e}`));
  }
  return next(request);
}
