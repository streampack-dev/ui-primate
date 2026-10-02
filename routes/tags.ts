import route from "primate/route";
import { ApiUnavailable, cachedGet } from "#api/client.ts";
import type { components } from "#api/schema.d.ts";
import { view } from "#lib/view.ts";

type Taxonomy = components["schemas"]["TaxonomySnapshot"];

/* Every tag, alphabetically, with how many published posts carry it (the API's taxonomy). */
export default route({
  async get() {
    let taxonomy: Taxonomy | null;
    try {
      taxonomy = await cachedGet<Taxonomy>("/taxonomy");
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e;
      return view("BackendUnavailable.marko", { meta: { title: "Tags" } }, { status: 503 });
    }
    const tags = Object.entries((taxonomy?.tags || {}) as Record<string, number>)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count, href: `/tags/${encodeURIComponent(name)}` }));
    return view("Tags.marko", {
      tags,
      count: `${tags.length} tag${tags.length === 1 ? "" : "s"} across all articles`,
      meta: { title: "Tags", description: "Browse articles by tag on bytecode.news", path: "/tags" },
    });
  },
});
