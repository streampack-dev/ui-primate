/* The reader's time zone (#35). clientjs's zone module (streampack-dev/clientjs, #79), the same in
   ui-pudl, keeps the browser's zone in the bcn-tz cookie so the server gives times in it. Until it
   has it (a first visit), the server gives UTC, so each time marked data-local is written again in
   the browser's zone, as is each log line's tooltip (data-local-title, #36); and an editor's date
   field shown in another zone is moved to this one, with the zone it's read in beside it, so what's
   saved is what the reader saw.

   This is the site's part: its wording, as src/lib/format.ts and src/lib/zone.ts say times, and
   doing it for each page shown. */
import { browserZone, localize, parts, rememberZone, zoneName } from "@streampack-dev/clientjs/zone";
import { eachPage } from "./each-page.ts";

const zone = browserZone() || "UTC";
rememberZone(zone);

/** As src/lib/format.ts's formatDateTime and formatUpdatedTime, in the browser's zone. */
function said(at: Date, form: string, zone: string): string {
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: zone });
  if (form === "updated") return `Updated ${time.replace(" ", "").toLowerCase()} ${zoneName(at, zone)}`;
  const day = at.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: zone });
  return `${day}, ${time} ${zoneName(at, zone)}`;
}

/** As src/lib/zone.ts's readerClock: a log line's tooltip, "Your time: 2026-10-12 23:00:00 EDT". */
function tooltip(at: Date, zone: string): string {
  const p = parts(at, { hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }, zone);
  return `Your time: ${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${zoneName(at, zone)}`;
}

eachPage(() => localize(document, { zone, said, tooltip }));
