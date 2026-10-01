import response from "primate/response";
import route from "primate/route";
import { cachedGet } from "#api/client.ts";
import type { ContentList, Features } from "#api/types.ts";
import { formatVersionText } from "#lib/format.ts";
import pkg from "../package.json" with { type: "json" };

/* Every page's frame: the header and footer, with what the API says the site offers. A page keeps
   rendering when the API can't be reached; the frame just says less. */
export default route({
  async get() {
    const [features, sidebar] = await Promise.allSettled([
      cachedGet<Features>("/features"),
      cachedGet<ContentList>("/posts", { category: "_sidebar", page: 0, size: 20 }),
    ]);
    const f = features.status === "fulfilled" ? features.value : null;
    const has = (word: string) =>
      !!f && ((f.operationGroups || []).some((g) => g.toLowerCase().includes(word)) ||
        (f.adapters || []).some((a) => a.toLowerCase().includes(word)));
    const siteName = f?.siteName || "ByteCode.News";
    return response.view("Layout.marko", {
      siteName,
      brand: [siteName.split(".")[0], siteName.split(".").slice(1).join(".") || "news"],
      factoids: has("factoid"),
      rss: has("rss"),
      backendVersion: f?.version
        ? formatVersionText({ version: f.version.version ?? undefined, commit: f.version.commit ?? undefined, branch: f.version.branch ?? undefined })
        : "unknown",
      frontendVersion: formatVersionText({ version: pkg.version, commit: process.env.UI_COMMIT, branch: process.env.UI_BRANCH }),
      sidebar: sidebar.status === "fulfilled" ? (sidebar.value?.posts || []).map(({ id, title, slug }) => ({ id, title, slug })) : [],
      year: new Date().getFullYear(),
    });
  },
});
