/* The reader's time zone (#35): the browser's, kept in a cookie so the server gives times in it.
   Until it has it (a first visit), the server gives UTC, so each time marked data-local is written
   again here in the browser's zone; and an editor's date field shown in another zone is moved to
   this one, with the zone it's read in beside it, so what's saved is what the reader saw. */
import { eachPage } from "./each-page.ts";

const COOKIE = "bcn-tz";
const zone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
})();

if (!document.cookie.split("; ").includes(`${COOKIE}=${encodeURIComponent(zone)}`)) {
  document.cookie = `${COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; SameSite=Lax`;
}

const zoneName = (at: Date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? zone;

/** As src/lib/format.ts's formatDateTime and formatUpdatedTime, in the browser's zone. */
function said(at: Date, form: string): string {
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: zone });
  if (form === "updated") return `Updated ${time.replace(" ", "").toLowerCase()} ${zoneName(at)}`;
  const day = at.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: zone });
  return `${day}, ${time} ${zoneName(at)}`;
}

/** [at] on the browser's wall clock, as a datetime-local value. */
function wall(at: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

eachPage(() => {
  for (const time of document.querySelectorAll<HTMLTimeElement>("time[data-local]:not([data-local-zone])")) {
    const at = new Date(time.dateTime);
    time.dataset.localZone = zone;
    if (!Number.isNaN(at.getTime())) time.textContent = said(at, time.dataset.local || "");
  }
  // A date field given in another zone: the same instant, on this zone's clock (data-instant is it, in UTC).
  for (const field of document.querySelectorAll<HTMLInputElement>("input[data-zone-field]")) {
    const sent = field.form?.querySelector<HTMLInputElement>(`input[name="${field.dataset.zoneField}"]`);
    if (!sent || sent.value === zone) continue;
    const at = field.dataset.instant ? new Date(field.dataset.instant) : null;
    if (at && !Number.isNaN(at.getTime()) && field.value === field.dataset.shown) field.value = wall(at);
    field.dataset.shown = field.value;
    sent.value = zone;
    const label = field.id ? document.querySelector(`[data-zone-label="${field.id}"]`) : null;
    if (label) label.textContent = zone;
  }
});
