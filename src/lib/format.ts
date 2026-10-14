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

/** A date and time to the minute, in UTC as the editor's publish date is: "October 20, 2026, 9:00 AM UTC". */
export function formatDateTime(value?: string): string {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" });
  return `${formatDate(value)}, ${time} UTC`;
}

export function formatUpdatedTime(value?: string): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  // In Eastern time, as it says, whatever zone the server runs in.
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" })
    .replace(" ", "").toLowerCase();
  return `Updated ${time} ET`;
}
