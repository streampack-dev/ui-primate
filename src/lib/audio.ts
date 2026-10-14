/* A post's recording (#33, streampack#196): its `audio` version, as the post page plays it and the
   editor describes it, as ui-pudl's PostAudio has it. Its url is the API's own address for it,
   used exactly as given: it's on the API's origin, and front ends must not rewrite it. */
import type { components } from "#api/schema.d.ts";
import { formatDate } from "#lib/format.ts";

type Version = components["schemas"]["PostVersionView"];

/** The kind a recording is; the only kind there is so far. */
export const KIND = "audio";

/** The most the site takes, as the API does: 100 MB. BCN_RECORDING_MAX_BYTES sets another limit,
   so the tests can try a too-big upload with a few hundred KB rather than 100 MB. */
export const MAX_BYTES = Number(process.env.BCN_RECORDING_MAX_BYTES) || 100 * 1024 * 1024;

/** [MAX_BYTES] in words: "100 MB". */
export const MAX_LABEL = limitLabel(MAX_BYTES);

export type PostAudio = {
  url: string;
  mediaType: string;
  /** MP3, M4A, Ogg, Opus; else the media type. */
  format: string;
  /** "3.9 MB". */
  size: string;
  /** "4 minutes 17 seconds", and "PT4M17S" for `<time datetime>`; null when unknown. */
  words: string | null;
  iso: string | null;
  note: string | null;
  maker: string | null;
  /** Whether it was recorded from the post as it is now, rather than an earlier draft. */
  current: boolean;
  created: { iso: string; label: string };
  replaced: { iso: string; label: string } | null;
};

/** The post's recording, or null when it has none (or media is off on the API). */
export function audioOf(versions: Version[] | null | undefined): PostAudio | null {
  const v = (versions || []).find((x) => x.kind === KIND && !x.variant);
  if (!v?.url) return null;
  const seconds = typeof v.duration === "number" ? v.duration : null;
  return {
    url: v.url,
    mediaType: v.mediaType,
    format: format(v.mediaType),
    size: sizeLabel(v.size),
    words: seconds === null ? null : words(seconds),
    iso: seconds === null ? null : `PT${seconds}S`,
    note: v.note?.trim() || null,
    maker: v.maker?.trim() || null,
    current: !!v.current,
    created: { iso: v.createdAt, label: formatDate(v.createdAt) },
    replaced: v.replacedAt ? { iso: v.replacedAt, label: formatDate(v.replacedAt) } : null,
  };
}

/** Whether a post list's `versionKinds` says the post has a recording. */
export const listed = (versionKinds: string[] | null | undefined) => (versionKinds || []).includes(KIND);

function format(mediaType: string): string {
  switch (mediaType.split(";")[0].trim().toLowerCase()) {
    case "audio/mpeg": return "MP3";
    case "audio/mp4": return "M4A";
    case "audio/ogg": return "Ogg";
    case "audio/opus": return "Opus";
    default: return mediaType;
  }
}

export function sizeLabel(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} bytes`;
}

/** A size limit in words, by binary units as limits are set: 100 MiB is "100 MB", 100 KiB "100 KB". */
export function limitLabel(bytes: number): string {
  const MB = 1024 * 1024;
  if (bytes >= MB && bytes % MB === 0) return `${bytes / MB} MB`;
  if (bytes >= 1024 && bytes % 1024 === 0) return `${bytes / 1024} KB`;
  return `${bytes} bytes`;
}

export function words(seconds: number): string {
  const part = (n: number, unit: string) => (n === 0 ? null : `${n} ${unit}${n === 1 ? "" : "s"}`);
  return [part(Math.floor(seconds / 3600), "hour"), part(Math.floor(seconds % 3600 / 60), "minute"), part(seconds % 60, "second")]
    .filter(Boolean).join(" ") || "0 seconds";
}

/** A length typed in the editor: whole seconds ("257"), minutes and seconds ("4:17"), or hours too
   ("1:02:03"). Null for anything else; the API checks the range. */
export function parseLength(typed: string): number | null {
  const parts = typed.trim().split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const numbers = parts.map(Number);
  if (numbers.slice(1).some((n) => n >= 60)) return null;
  const seconds = numbers.reduce((total, n) => total * 60 + n, 0);
  return Number.isSafeInteger(seconds) && seconds <= 2_147_483_647 ? seconds : null;
}
