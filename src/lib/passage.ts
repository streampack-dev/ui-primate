import type { ContentSummary } from "#api/types.ts";

type Match = NonNullable<ContentSummary["match"]>;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]!);

/**
 * A search result's passage (streampack#226) as HTML: the text escaped, and each marked range in a
 * <mark>. The API sends plain text and offsets, never markup, so nothing it says is trusted as
 * HTML. Offsets are UTF-16 units, as JavaScript strings count them. A mark out of range, empty,
 * backwards or overlapping the one before is left out. Empty without a match.
 */
export function passageHtml(match: Match | null | undefined): string {
  if (!match) return "";
  const text = match.text;
  const marks = [...(match.marks || [])]
    .filter((m) => Number.isInteger(m.start) && Number.isInteger(m.end) && m.start >= 0 && m.end <= text.length && m.start < m.end)
    .sort((a, b) => a.start - b.start);
  let html = "";
  let at = 0;
  for (const m of marks) {
    if (m.start < at) continue;
    html += escape(text.slice(at, m.start)) + "<mark>" + escape(text.slice(m.start, m.end)) + "</mark>";
    at = m.end;
  }
  return html + escape(text.slice(at));
}
