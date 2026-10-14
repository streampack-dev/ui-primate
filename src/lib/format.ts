import { readerZone, toZoned, zoneName } from "#lib/zone.ts";

// Build a human-readable version string, preferring semantic version over git details
export function formatVersionText(info: { version?: string; commit?: string; branch?: string }): string {
  if (info.version) {
    return info.version.startsWith("v") ? info.version : `v${info.version}`;
  }

  const commit = info.commit ? info.commit.substring(0, 7) : undefined;
  const label = commit || "unknown";

  return info.branch ? `${label} (${info.branch})` : label;
}

export function formatDate(value?: string): string {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  // The site's day, as ui-pudl gives it (UTC, like the logs), whatever zone the server runs in.
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * A date and time to the minute in [zone], the reader's unless given, named: "October 20, 2026,
 * 9:00 AM EDT". The API's times are UTC; the reader's are their own (src/lib/zone.ts).
 */
export function formatDateTime(value?: string, zone: string = readerZone()): string {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const day = date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: zone });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: zone });
  return `${day}, ${time} ${zoneName(date, zone)}`;
}

export function formatUpdatedTime(value?: string, zone: string = readerZone()): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  // In the reader's zone, named, whatever zone the server runs in.
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: zone })
    .replace(" ", "").toLowerCase();
  return `Updated ${time} ${zoneName(date, zone)}`;
}

/** A time to the minute in [zone], the reader's unless given, compactly, for admin lists: "2026-10-06 03:04 EDT". */
export function formatStamp(value: string | null | undefined, zone: string = readerZone()): string {
  const local = toZoned(value, zone);
  return local ? `${local.slice(0, 10)} ${local.slice(11, 16)} ${zoneName(new Date(value!), zone)}` : "";
}
