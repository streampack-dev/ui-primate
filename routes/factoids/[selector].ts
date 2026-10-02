import response from "primate/response";
import route from "primate/route";
import { ApiUnavailable, cachedGet } from "#api/client.ts";
import type { components } from "#api/schema.d.ts";
import { attributes, knowledgeBase } from "#lib/factoids.ts";
import { formatDate } from "#lib/format.ts";
import { meta } from "#lib/meta.ts";
import { pageAsked } from "#lib/post-rows.ts";

type Factoid = components["schemas"]["FactoidDetailResponse"];

/* A factoid, its attributes as the bot says them; [[factoid]] links in posts come here. */
export default route({
  async get(request) {
    const raw = request.path.get("selector");
    let selector: string;
    try {
      selector = decodeURIComponent(raw);
    } catch {
      selector = raw;
    }
    const back = knowledgeBase((request.query.try("q") || "").trim(), pageAsked(request.query.try("page")));
    const title = meta({ title: selector, description: `Factoid lookup for ${selector} on bytecode.news`, path: `/factoids/${encodeURIComponent(selector)}` });

    let factoid: Factoid | null;
    try {
      factoid = await cachedGet<Factoid>(`/factoids/${encodeURIComponent(selector)}`);
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e;
      return response.view("FactoidsUnavailable.marko", { title: "Factoid Unavailable", body: "The factoid API is currently unreachable. Please refresh shortly." },
        { status: 503, placeholders: { meta: title } });
    }
    if (!factoid) return response.view("FactoidMissing.marko", { selector, back }, { status: 404, placeholders: { meta: title } });
    const name = factoid.selector || selector;
    return response.view("Factoid.marko", {
      selector: name,
      back,
      by: factoid.updatedBy || "",
      updated: factoid.updatedAt || "",
      date: formatDate(factoid.updatedAt),
      lookups: `${factoid.accessCount || 0} lookups`,
      locked: !!factoid.locked,
      attributes: attributes(name, factoid.attributes || []),
    }, { placeholders: { meta: title } });
  },
});
