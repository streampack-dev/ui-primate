/* Factoids as ui-nextjs shows them: a factoid's attributes as the bot says them, each kind once. */

export type Attribute = { type?: string; value?: string | null; rendered?: string };
export type Shown = { label: string; kind: "text" | "seealso" | "urls"; values: { text: string; href?: string }[] };

const pretty = (type: string) => (type === "seealso" ? "See Also" : type.charAt(0).toUpperCase() + type.slice(1));
const split = (value: string) => value.split(",").map((v) => v.trim()).filter(Boolean);

/** [value] as a link out, if it's an http or https address. */
function safeHttp(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Text as the bot says it: "selector is text", or a <reply> as itself. */
function said(selector: string, value: string, rendered: string): string[] {
  const candidate = value.trim() || rendered.trim();
  if (!candidate) return [];
  const reply = /^<reply>\s*(.*)$/is.exec(candidate);
  if (reply) return reply[1].trim() ? [reply[1].trim()] : [];
  return [`${selector} is ${candidate}`];
}

export function attributes(selector: string, all: Attribute[] = []): Shown[] {
  const seen = new Set<string>();
  const shown: Shown[] = [];
  for (const a of all) {
    const type = String(a.type || "").toLowerCase();
    if (!type || seen.has(type)) continue;
    seen.add(type);
    const value = String(a.value || "");
    const rendered = String(a.rendered || "");
    if (type === "text") {
      shown.push({ label: pretty(type), kind: "text", values: said(selector, value, rendered).map((text) => ({ text })) });
    } else if (type === "seealso") {
      shown.push({ label: pretty(type), kind: "seealso", values: split(value).map((text) => ({ text, href: `/factoids/${encodeURIComponent(text)}` })) });
    } else if (type === "url" || type === "urls") {
      shown.push({ label: pretty(type), kind: "urls", values: split(value).map((text) => ({ text, href: safeHttp(text) })) });
    } else if (type === "tags") {
      shown.push({ label: pretty(type), kind: "text", values: split(value).map((text) => ({ text })) });
    } else {
      const text = rendered.trim() || value.trim();
      shown.push({ label: pretty(type), kind: "text", values: text ? [{ text }] : [] });
    }
  }
  return shown;
}

/** The knowledge base's address with [q] and [page], left out where they're the defaults. */
export function knowledgeBase(q: string, page: number, base = "/factoids"): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 0) params.set("page", String(page));
  return params.size ? `${base}?${params}` : base;
}
