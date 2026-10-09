/* The tag vocabulary's admin side (streampack#140, #139), as ui-pudl's Tags window has it
   (ui-pudl#212), drawn here as pages: doubtful new tags to alias, split, keep or dismiss; feed tags
   waiting to be mapped, created or ignored; the aliases; the stoplist; and what was done, by whom.
   Aliasing, splitting, adding and removing an alias are asked first, on a page of their own, and
   the first three are previewed by the API's dry run before Confirm is offered. */
import { cachedGet, send } from "#api/client.ts";
import type { components } from "#api/schema.d.ts";
import { refusal } from "#auth/forms.ts";
import { asReader, bearer, getAsReader, SignInRequired } from "#auth/signed-in.ts";

export type ReviewEntry = components["schemas"]["TagReviewEntry"];
export type ReviewList = components["schemas"]["TagReviewListResponse"];
export type FeedTag = components["schemas"]["FeedTagEntry"];
export type FeedTagList = components["schemas"]["FeedTagListResponse"];
export type AliasEntry = components["schemas"]["TagAliasEntry"];
export type StopEntry = components["schemas"]["TagStopEntry"];
export type ActionEntry = components["schemas"]["TagActionEntry"];
export type ChangeResult = components["schemas"]["TagChangeResult"];

/** A page of review entries or feed tags. */
export const SIZE = 20;
/** History's length. */
export const HISTORY = 50;

/** The sections, each its own page; [statuses] filter it, the first its default. */
export const SECTIONS = {
  review: { label: "Review", href: "/admin/tags", statuses: ["open", "aliased", "split", "kept", "dismissed", "all"] },
  feed: { label: "Feed tags", href: "/admin/tags/feed", statuses: ["waiting", "promoted", "created", "mapped", "ignored", "all"] },
  aliases: { label: "Aliases", href: "/admin/tags/aliases", statuses: [] },
  stoplist: { label: "Stoplist", href: "/admin/tags/stoplist", statuses: [] },
  history: { label: "History", href: "/admin/tags/history", statuses: [] },
} as const;
export type Section = keyof typeof SECTIONS;

/** Where a list is: its section, filtered how, which page (from 0, as the API counts). */
export type At = { section: Section; status: string | null; page: number };

/** [section] at [status] (its default when absent or unknown) and [page]. */
export function at(section: Section, status: string | undefined | null, page: string | undefined | null): At {
  const statuses = SECTIONS[section].statuses as readonly string[];
  const asked = (status || "").toLowerCase();
  const s = statuses.includes(asked) ? asked : statuses[0] ?? null;
  const n = Number.parseInt(page || "0", 10);
  return { section, status: s, page: statuses.length && Number.isFinite(n) && n >= 0 && n < 10_000 ? n : 0 };
}

/** [where]'s address: its default status and first page said by leaving them out. */
export function href(where: At): string {
  const { statuses } = SECTIONS[where.section];
  const query = new URLSearchParams({
    ...(where.status && where.status !== statuses[0] ? { status: where.status } : {}),
    ...(where.page > 0 ? { page: String(where.page) } : {}),
  }).toString();
  return `${SECTIONS[where.section].href}${query ? `?${query}` : ""}`;
}

/** The list a form came from, as its `back` field (its address's query) says; [section]'s first page if none. */
export function backTo(section: Section, back: string | undefined): At {
  const q = new URLSearchParams(back || "");
  return at(section, q.get("status"), q.get("page"));
}

/** [where]'s query, for a form's `back` field. */
export const backField = (where: At) => href(where).split("?")[1] ?? "";

const WHEN = (iso: string | null | undefined) => {
  if (!iso) return "";
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? "" : `${t.toISOString().slice(0, 10)} ${t.toISOString().slice(11, 16)} UTC`;
};

export const q = (s: string) => `“${s}”`;

/** “java”, “kotlin” and “jvm”. */
export function both(names: string[]): string {
  const quoted = names.map(q);
  return quoted.length > 1 ? `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}` : quoted.join("");
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const NUMBERS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const counted = (n: number, one: string) => `${NUMBERS[n] ?? n} ${n === 1 ? one : `${one}s`}`;

/** What an alias or split would do, as its dry run counts it. */
export function previewText(r: ChangeResult): string {
  return r.posts === 0 && r.factoids === 0
    ? `Nothing carries ${q(r.tag)} yet, so nothing is re-pointed to ${both(r.now)}.`
    : `This re-points ${plural(r.posts, "post")} and ${plural(r.factoids, "factoid")} to ${both(r.now)}.`;
}

/** The rule's hint for [e], in words. */
export function hint(e: ReviewEntry): string {
  const other = e.hintTags[0];
  switch (e.hintKind) {
    case "PLURAL":
      if (!other) return "Differs from an existing tag by a trailing s";
      if (e.tag === `${other}s`) return `Plural of ${q(other)}`;
      if (other === `${e.tag}s`) return `Singular of ${q(other)}`;
      return `Differs from ${q(other)} by a trailing s`;
    case "MISSING_COMMA": {
      const n = counted(e.hintTags.length, "existing tag");
      return `${n.charAt(0).toUpperCase()}${n.slice(1)} run together, a comma missing: ${e.hintTags.map(q).join(", ")}`;
    }
    default:
      return other ? `No rule matched; the AI named ${q(other)}` : "No rule matched; only the AI found something";
  }
}

/** How sure the AI is, in a word as well as a number. */
export function confidenceWord(c: number): string {
  if (c >= 0.9) return "very likely";
  if (c >= 0.75) return "likely";
  if (c >= 0.5) return "possibly";
  return "unlikely";
}

const SOURCES: Record<string, string> = { post: "a post", factoid: "a factoid", rss: "a feed" };
const label = (status: string) => status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();

/** The tag an entry most likely means: the AI's candidate, or the plural rule's pair. */
export const aliasTarget = (e: ReviewEntry) => e.aiCandidate || (e.hintKind !== "MISSING_COMMA" ? e.hintTags[0] : "") || "";

/** The parts a split makes: the hint's, for a missing comma; else the tag's own words. */
export const splitParts = (e: ReviewEntry) =>
  e.hintKind === "MISSING_COMMA" && e.hintTags.length >= 2 ? e.hintTags : e.tag.split(" ").filter(Boolean);

/** "java, kotlin" as parts; blanks dropped, at most twenty. */
export const parts = (given: string | undefined) => (given || "").split(",").map((p) => p.trim()).filter(Boolean).slice(0, 20);

/** A review entry as its list shows it. */
export function reviewRow(e: ReviewEntry, back: string) {
  const open = e.status === "OPEN";
  const ai = e.aiCandidate
    ? {
      candidate: e.aiCandidate,
      percent: typeof e.aiConfidence === "number" ? Math.round(e.aiConfidence * 100) : null,
      word: typeof e.aiConfidence === "number" ? confidenceWord(e.aiConfidence) : null,
      reason: e.aiReason?.trim() || "",
      model: e.aiModel || "",
    }
    : null;
  const ask = (action: string) => `/admin/tags/review/${e.id}/${action}${back ? `?${new URLSearchParams({ back })}` : ""}`;
  return {
    id: e.id,
    tag: e.tag,
    source: SOURCES[e.source] ?? e.source,
    firstSeen: WHEN(e.firstSeen),
    firstSeenAt: e.firstSeen,
    hint: hint(e),
    ai,
    status: label(e.status),
    open,
    acted: !open && e.actedBy ? `${label(e.status)} by ${e.actedBy}${e.actedAt ? `, ${WHEN(e.actedAt)}` : ""}` : "",
    aliasHref: ask("alias"),
    splitHref: ask("split"),
  };
}

/** A feed tag as its list shows it, against the promotion thresholds. */
export function feedRow(t: FeedTag, promoteEntries: number, promoteFeeds: number) {
  const waiting = t.status === "WAITING";
  const counts = waiting
    ? `${t.entries} of ${plural(promoteEntries, "entry", "entries")}, ${t.feeds} of ${plural(promoteFeeds, "feed")}`
    : `${plural(t.entries, "entry", "entries")}, ${plural(t.feeds, "feed")}`;
  let decided = "";
  if (!waiting) {
    decided = t.status === "MAPPED" ? (t.tag ? `Maps to ${q(t.tag)}` : "Mapped")
      : t.status === "IGNORED" ? "Ignored, on the stoplist"
      : t.status === "PROMOTED" ? `Promoted to a tag${t.tag ? `, ${q(t.tag)}` : ""}`
      : `Created as a tag${t.tag ? `, ${q(t.tag)}` : ""}`;
    if (t.decidedBy) decided += `, by ${t.decidedBy}`;
    if (t.decidedAt) decided += `, ${WHEN(t.decidedAt)}`;
  }
  return {
    name: t.name,
    written: t.written,
    status: label(t.status),
    waiting,
    counts,
    seen: `First seen ${WHEN(t.firstSeen)}, last ${WHEN(t.lastSeen)}`,
    decided,
    examples: t.examples.map((x) => ({ id: x.entryId, title: x.title, link: /^https?:\/\//i.test(x.link) ? x.link : "", feed: x.feedTitle })),
  };
}

const ACTIONS: Record<ActionEntry["action"], string> = {
  ALIAS: "Aliased", UNALIAS: "Alias removed", SPLIT: "Split", KEEP: "Kept", DISMISS: "Dismissed",
  STOP: "Stoplisted", UNSTOP: "Off the stoplist", REMOVE: "Removed",
};

export const historyRow = (a: ActionEntry, i: number) => ({
  key: `${a.actedAt}-${i}`, action: ACTIONS[a.action] ?? a.action, subject: a.subject, detail: a.detail || "", actor: a.actor, when: WHEN(a.actedAt), at: a.actedAt,
});

export const aliasRow = (a: AliasEntry) => ({
  alias: a.alias, tag: a.tag, by: `${a.createdBy}, ${WHEN(a.createdAt)}`, removeHref: `/admin/tags/aliases/remove?${new URLSearchParams({ alias: a.alias })}`,
});

export const stopRow = (s: StopEntry) => ({ term: s.term, by: `${s.createdBy}, ${WHEN(s.createdAt)}` });

/** "Page 2 of 3", or "Page 2" where the API doesn't say how many. */
export const pageLabel = (where: At, totalPages: number | null | undefined) =>
  `Page ${where.page + 1}${totalPages && totalPages > 0 ? ` of ${totalPages}` : ""}`;

/** How many this filter has in all, in words: "127 kept entries", "1 waiting feed tag". */
export function countLabel(where: At, total: number | null | undefined): string {
  if (typeof total !== "number") return "";
  const status = where.status && where.status !== "all" ? `${where.status} ` : "";
  const noun = where.section === "review" ? (total === 1 ? "entry" : "entries") : (total === 1 ? "feed tag" : "feed tags");
  return `${total} ${status}${noun}`;
}

/** What a list says when it's empty. */
export function emptyText(where: At): string {
  switch (where.section) {
    case "review": return where.status === "open" ? "Nothing to review: every new tag looked sound." : `No ${where.status === "all" ? "" : `${where.status} `}entries.`;
    case "feed": return where.status === "waiting" ? "No feed tags waiting." : where.status === "all" ? "No feed tags yet." : `No ${where.status} feed tags.`;
    case "aliases": return "No aliases yet.";
    case "stoplist": return "Nothing is stoplisted.";
    default: return "Nothing has been done to the vocabulary yet.";
  }
}

/** Every tag in use, posts' and factoids', for the "to" fields' suggestions; none if it can't be had. */
export async function vocabulary(): Promise<string[]> {
  try {
    const t = await cachedGet<{ tags?: Record<string, number>; factoidTags?: Record<string, number> | null }>("/taxonomy");
    return [...new Set([...Object.keys(t?.tags || {}), ...Object.keys(t?.factoidTags || {})])].filter((n) => !n.startsWith("_")).sort();
  } catch {
    return [];
  }
}

/** Open review entries and waiting feed tags, each null when it can't be said; [known] isn't asked again. */
export async function counts(known: { open?: number | null; waiting?: number | null } = {}): Promise<{ open: number | null; waiting: number | null }> {
  const [open, waiting] = await Promise.all([
    known.open !== undefined ? known.open
      : getAsReader<ReviewList>("/admin/tags/review", { status: "open", page: 0, size: 1 }).then((l) => l?.openCount ?? null, () => null),
    known.waiting !== undefined ? known.waiting
      : getAsReader<FeedTagList>("/admin/rss/tags", { status: "waiting", page: 0, size: 1 }).then((l) => l?.waitingCount ?? null, () => null),
  ]);
  return { open: typeof open === "number" ? open : null, waiting: typeof waiting === "number" ? waiting : null };
}

/** What needs an admin: open review entries and waiting feed tags; null when neither can be said. */
export const attention = (c: { open: number | null; waiting: number | null }) =>
  c.open === null && c.waiting === null ? null : (c.open ?? 0) + (c.waiting ?? 0);

export type Preview = { ok: boolean; text: string };

/**
 * What [path] would do with [body], from the API's dry run, changing nothing: what it would
 * re-point, or, refused, "Not possible: " and the API's own words.
 */
export async function dryRun(path: string, body: unknown): Promise<Preview> {
  let answer: Response;
  try {
    answer = await asReader((a) => send("POST", `${path}?dryRun=true`, body, bearer(a)));
  } catch (e) {
    if (e instanceof SignInRequired) throw e;
    return { ok: false, text: "The API couldn't say what this would do just now." };
  }
  if (answer.ok) {
    try {
      return { ok: true, text: previewText(await answer.json() as ChangeResult) };
    } catch {
      return { ok: false, text: "The API couldn't say what this would do just now." };
    }
  }
  if (answer.status >= 500) return { ok: false, text: "The API couldn't say what this would do just now." };
  return { ok: false, text: `Not possible: ${await refusal(answer, "the API refused it.")}` };
}

/* After an action, the list says what was done, by a fixed code (`done`) and what the API answered:
   the names it acted on (`t`, `to`), shape-checked, and the counts (`p`, `f`). Never other words. */

/** A name as a notice will quote it: no control characters, not too long. */
const NAME = /^[^\p{C}]{1,100}$/u;
const COUNT = /^\d{1,6}$/;

/** The address [where] with what was done: [done], the names [tag] and [to], and the counts in [r]. */
export function doneHref(where: At, done: string, tag: string, to: string[] = [], r?: { posts: number; factoids: number }) {
  const query = new URLSearchParams({ done, t: tag });
  for (const name of to.slice(0, 20)) query.append("to", name);
  if (r) {
    query.set("p", String(r.posts));
    query.set("f", String(r.factoids));
  }
  const base = href(where);
  return `${base}${base.includes("?") ? "&" : "?"}${query}`;
}

/** What a list says after an action, from its address ([query]), or undefined. */
export function doneSaying(query: URLSearchParams): string | undefined {
  const t = query.get("t") || "";
  const tag = NAME.test(t) ? q(t) : "The tag";
  const to = query.getAll("to").filter((n) => NAME.test(n)).slice(0, 20);
  const p = query.get("p") || "";
  const f = query.get("f") || "";
  const repointed = COUNT.test(p) && COUNT.test(f)
    ? (Number(p) === 0 && Number(f) === 0 ? "nothing carried it" : `${plural(Number(p), "post")} and ${plural(Number(f), "factoid")} re-pointed`)
    : null;
  const tail = repointed ? `: ${repointed}.` : ".";
  const target = to.length ? q(to[0]) : "another tag";
  const feed = NAME.test(t) ? `Feed tag ${tag}` : "The feed tag";
  switch (query.get("done")) {
    case "aliased": return `${tag} is now an alias of ${to.length ? to.map(q).join(", ") : "another tag"}${tail}`;
    case "split": return `${tag} is split into ${to.length ? both(to) : "its parts"}${tail}`;
    case "kept": return `${tag} is kept as a tag.`;
    case "dismissed": return `${tag} is dismissed, left as it is.`;
    case "mapped": return `${feed} now maps to ${target}.`;
    case "ignored": return `${feed} is ignored: it's on the stoplist.`;
    case "created": return `${feed} is now ${to.length ? `the tag ${target}` : "a tag"}.`;
    case "unaliased": return `${tag} is no longer an alias${to.length ? ` of ${target}` : ""}.`;
    case "stopped": return `${tag} is on the stoplist: it's dropped from tags written from now on.`;
    case "unstopped": return `${tag} is off the stoplist.`;
    default: return undefined;
  }
}
