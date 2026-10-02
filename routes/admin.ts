import route from "primate/route";
import { cachedGet } from "#api/client.ts";
import type { components } from "#api/schema.d.ts";
import type { ContentList, Features } from "#api/types.ts";
import { getAsReader } from "#auth/signed-in.ts";
import { formatVersionText } from "#lib/format.ts";
import { admin, adminPage, notFound } from "#lib/admin.ts";
import pkg from "../package.json" with { type: "json" };

type User = components["schemas"]["UserPrincipal"];
type Category = components["schemas"]["CategorySummary"];
type Taxonomy = components["schemas"]["TaxonomySnapshot"];

/** The dashboard, with [opml] shown again (a refused import, or the API's word on one that went). */
export async function dashboard(opml: { payload?: string; error?: string; said?: string } = {}, status = 200) {
  const settle = async <T>(p: Promise<T>) => { try { return await p; } catch { return null; } };
  const [pending, published, active, suspended, categories, taxonomy, features] = await Promise.all([
    settle(getAsReader<ContentList>("/admin/posts/pending", { page: 0, size: 1, deleted: "false" })),
    settle(cachedGet<ContentList>("/posts", { page: 0, size: 1 })),
    settle(getAsReader<User[]>("/admin/users", { status: "ACTIVE" })),
    settle(getAsReader<User[]>("/admin/users", { status: "SUSPENDED" })),
    settle(cachedGet<Category[]>("/categories")),
    settle(cachedGet<Taxonomy>("/taxonomy")),
    settle(cachedGet<Features>("/features")),
  ]);
  const count = (n: number | undefined | null) => (n === undefined || n === null ? "--" : String(n));
  const categoryCounts = (taxonomy?.categories || {}) as Record<string, number>;
  const tags = Object.entries((taxonomy?.tags || {}) as Record<string, number>).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20);

  return adminPage("AdminDashboard.marko", {
    stats: [
      { label: "Pending Drafts", value: count(pending?.totalCount), href: "/admin/pending" },
      { label: "Published", value: count(published?.totalCount), href: null },
      { label: "Active Users", value: count(active?.length), href: "/admin/users" },
      { label: "Suspended", value: count(suspended?.length), href: "/admin/users?status=SUSPENDED" },
    ],
    categories: (categories || []).filter((c) => c.name && !c.name.startsWith("_")).map((c) => ({
      name: c.name!, parent: c.parentName || null, posts: categoryCounts[c.name!.toLowerCase()] ?? 0,
    })),
    tags: tags.map(([name, n]) => ({ name, count: n })),
    system: features ? [
      ["Backend", features.version ? formatVersionText({ version: features.version.version ?? undefined, commit: features.version.commit ?? undefined, branch: features.version.branch ?? undefined }) : "unknown"],
      ["Frontend", formatVersionText({ version: pkg.version, commit: process.env.UI_COMMIT, branch: process.env.UI_BRANCH })],
      ["AI helpers", features.ai ? "On" : "Off"],
      ["Anonymous submission", features.anonymousSubmission ? "On" : "Off"],
    ] : [],
    opml,
  }, "Admin", "/admin", status);
}

export default route({
  get() {
    return admin() ? dashboard() : notFound();
  },
});
