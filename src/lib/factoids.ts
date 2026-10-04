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

/**
 * An attribute a signed-in reader can change, as the API names it, as ui-pudl has them (#170).
 * These are the ones a factoid's detail shows; the API also sets `see` and `maven`, but doesn't
 * show them, so they aren't offered to edit blind.
 */
export type Field = { name: string; label: string; hint: string; long?: boolean };

export const FIELDS: Field[] = [
  { name: "text", label: "Text", hint: "What the bot says, as “name is …”. Start with <reply> to have it say only this.", long: true },
  { name: "urls", label: "URLs", hint: "Web addresses, separated by commas. Empty, it's forgotten." },
  { name: "tags", label: "Tags", hint: "Separated by commas. Empty, it's forgotten." },
  { name: "languages", label: "Languages", hint: "Separated by commas. Empty, it's forgotten." },
  { name: "type", label: "Type", hint: "What sort of thing it is; separated by commas. Empty, it's forgotten." },
  { name: "seealso", label: "See Also", hint: "Other factoids, separated by commas. Empty, it's forgotten." },
];

/** [value] as it's stored: trimmed, and a list's items trimmed and joined by ", ". */
export function normal(field: Field, value: string): string {
  return field.long ? value.trim() : split(value).join(", ");
}

/** Each attribute's value as stored, by the API's name for it, the first of each kind. */
export function stored(all: Attribute[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of all) {
    const type = String(a.type || "").toLowerCase();
    if (type && !(type in out)) out[type] = String(a.value || "");
  }
  return out;
}

/**
 * What a save changes: each field the form has whose value differs from what it showed (its
 * `was.` twin), with the text first, since for a new factoid it's what creates it. An emptied
 * field is "" (forget that attribute).
 */
export function changes(form: Record<string, string>): { name: string; value: string }[] {
  return FIELDS.filter((f) => f.name in form)
    .map((f) => ({ name: f.name, value: normal(f, form[f.name] || ""), was: normal(f, form[`was.${f.name}`] || "") }))
    .filter((c) => c.value !== c.was)
    .map(({ name, value }) => ({ name, value }));
}

/** Whether the form showed nothing as stored: a factoid being taught. */
export function isNew(form: Record<string, string>): boolean {
  return FIELDS.every((f) => !(form[`was.${f.name}`] || "").trim());
}

/** A factoid's page. */
export const factoidHref = (selector: string) => `/factoids/${encodeURIComponent(selector)}`;
