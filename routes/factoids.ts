import route from "primate/route";
import { ApiUnavailable, cachedGet } from "#api/client.ts";
import type { components } from "#api/schema.d.ts";
import { knowledgeBase } from "#lib/factoids.ts";
import { formatDate } from "#lib/format.ts";
import { view } from "#lib/view.ts";
import { pageAsked, pager } from "#lib/post-rows.ts";

type Factoids = components["schemas"]["FactoidListResponse"];

/* The knowledge base, as ui-nextjs has it: the factoids, searchable, twenty to a page. */
export default route({
  async get(request) {
    const q = (request.query.try("q") || "").trim();
    const page = pageAsked(request.query.try("page"));
    const meta = { title: "Knowledge Base", description: "Browse public factoids and shared reference entries on bytecode.news", path: "/factoids" };
    let list: Factoids | null;
    try {
      list = await cachedGet<Factoids>("/factoids", { q: q || undefined, page, size: 20 });
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e;
      return view("FactoidsUnavailable.marko", { title: "Knowledge Base Unavailable", body: "The factoid API is currently unreachable. Please refresh in a moment.", meta },
        { status: 503 });
    }
    const count = Number(list?.totalCount ?? 0);
    return view("Factoids.marko", {
      q,
      count: `${count} entr${count === 1 ? "y" : "ies"}${q ? ` matching “${q}”` : ""}`,
      factoids: (list?.factoids || []).map((f) => ({
        selector: f.selector || "",
        href: knowledgeBase(q, page, `/factoids/${encodeURIComponent(f.selector || "")}`),
        hits: `${f.accessCount || 0} hits`,
        text: f.text || "",
        tags: f.tags || [],
        by: f.updatedBy || "",
        updated: f.updatedAt || "",
        date: formatDate(f.updatedAt),
        locked: !!f.locked,
      })),
      ...pager(page, list?.totalPages ?? 0, (p) => knowledgeBase(q, p)),
      meta,
    });
  },
});
