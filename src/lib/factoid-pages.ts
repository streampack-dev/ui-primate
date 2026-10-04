/* The knowledge base's pages, drawn for a GET and drawn again for a change the API refused, with
   the reason beside the reader's draft (#170), as a post's page is for a comment. */
import { ApiUnavailable, cachedGet } from "#api/client.ts";
import type { components } from "#api/schema.d.ts";
import { csrf, current, isAdmin } from "#auth/readers.ts";
import { attributes, factoidHref, FIELDS, knowledgeBase, stored } from "#lib/factoids.ts";
import { formatDate } from "#lib/format.ts";
import { view } from "#lib/view.ts";
import { pager } from "#lib/post-rows.ts";

type Factoid = components["schemas"]["FactoidDetailResponse"];
type Factoids = components["schemas"]["FactoidListResponse"];

/** A refused change: what the API said, and what the reader had typed, by field. */
export type Refused = { error: string; values: Record<string, string> };

/** What a page with the knowledge base's forms needs to know of the reader. */
function reader() {
  const who = current();
  return {
    signedIn: !!who,
    admin: isAdmin(who),
    csrf: who ? csrf() : "",
    headers: who ? { "Cache-Control": "private, no-store" } : {},
  };
}

/** The knowledge base, searched by [q], at [page]; [teach] a refused attempt to teach a factoid. */
export async function knowledgeBasePage(q: string, page: number, teach?: Refused & { selector: string }, status = 200) {
  const meta = { title: "Knowledge Base", description: "Browse public factoids and shared reference entries on bytecode.news", path: "/factoids" };
  const who = reader();
  let list: Factoids | null;
  try {
    list = await cachedGet<Factoids>("/factoids", { q: q || undefined, page, size: 20 });
  } catch (e) {
    if (!(e instanceof ApiUnavailable)) throw e;
    return view("FactoidsUnavailable.marko", { title: "Knowledge Base Unavailable", body: "The factoid API is currently unreachable. Please refresh in a moment.", meta },
      { status: 503, headers: who.headers });
  }
  const count = Number(list?.totalCount ?? 0);
  return view("Factoids.marko", {
    q,
    count: `${count} entr${count === 1 ? "y" : "ies"}${q ? ` matching “${q}”` : ""}`,
    factoids: (list?.factoids || []).map((f) => ({
      selector: f.selector || "",
      href: knowledgeBase(q, page, factoidHref(f.selector || "")),
      hits: `${f.accessCount || 0} hits`,
      text: f.text || "",
      tags: f.tags || [],
      by: f.updatedBy || "",
      updated: f.updatedAt || "",
      date: formatDate(f.updatedAt),
      locked: !!f.locked,
    })),
    ...pager(page, list?.totalPages ?? 0, (p) => knowledgeBase(q, p)),
    signedIn: who.signedIn,
    csrf: who.csrf,
    teach: teach ? { error: teach.error, selector: teach.selector, text: teach.values.text || "" } : null,
    meta,
  }, { status, headers: who.headers });
}

/** The factoid named [selector], or the page that offers to teach it; [refused] a refused change to it. */
export async function factoidPage(selector: string, back: string, refused?: Refused, status = 200) {
  const meta = { title: selector, description: `Factoid lookup for ${selector} on bytecode.news`, path: factoidHref(selector) };
  const who = reader();
  let factoid: Factoid | null;
  try {
    factoid = await cachedGet<Factoid>(`/factoids/${encodeURIComponent(selector)}`);
  } catch (e) {
    if (!(e instanceof ApiUnavailable)) throw e;
    return view("FactoidsUnavailable.marko", { title: "Factoid Unavailable", body: "The factoid API is currently unreachable. Please refresh shortly.", meta },
      { status: 503, headers: who.headers });
  }
  const forms = { signedIn: who.signedIn, admin: who.admin, csrf: who.csrf, action: factoidHref(selector), error: refused?.error || "" };
  if (!factoid) {
    return view("FactoidMissing.marko", { selector, back, ...forms, text: refused?.values.text || "", meta },
      { status: refused ? status : 404, headers: who.headers });
  }
  const name = factoid.selector || selector;
  const was = stored(factoid.attributes || []);
  return view("Factoid.marko", {
    selector: name,
    back,
    by: factoid.updatedBy || "",
    updated: factoid.updatedAt || "",
    date: formatDate(factoid.updatedAt),
    lookups: `${factoid.accessCount || 0} lookups`,
    locked: !!factoid.locked,
    attributes: attributes(name, factoid.attributes || []),
    ...forms,
    action: factoidHref(name),
    // The editor's fields: the refused draft, else what's stored, each with what it showed.
    fields: FIELDS.map((f) => ({ ...f, long: !!f.long, value: refused?.values[f.name] ?? was[f.name] ?? "", was: was[f.name] ?? "" })),
    forgetHref: `${factoidHref(name)}?forget`,
    meta,
  }, { status, headers: who.headers });
}
