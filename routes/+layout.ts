import response from "primate/response";
import route from "primate/route";
import { cachedGet } from "#api/client.ts";
import type { ContentList, Features } from "#api/types.ts";
import { formatVersionText } from "#lib/format.ts";
import pkg from "../package.json" with { type: "json" };
import { current, isAdmin } from "#auth/readers.ts";
import session from "@/config/session";

/* Every page's frame: the header and footer, with what the API says the site offers. A page keeps
   rendering when the API can't be reached; the frame just says less. A layout frames only the
   methods it answers, so it answers POST too, for a form shown again.

   Primate calls a layout's handler for every request, even one whose route answers with a plain
   Response it never frames (a feed, a card, a beacon, the editor's live preview). So the handler
   only hands back how to draw the frame, and the API is asked when a page is actually drawn. */
async function draw() {
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
    // Who's signed in, and the token their sign-out form carries. A reader who isn't gets no
    // session for it: the header only links to the login page.
    reader: current(),
    admin: isAdmin(current()),
    csrf: (session.try() as { csrf?: string } | undefined)?.csrf ?? "",
    submit: !!current() || f?.anonymousSubmission !== false,
  });
}

type Draw = (app: unknown, transfer: unknown, request: unknown) => unknown;
const frame = () => async (app: unknown, transfer: unknown, request: unknown) =>
  ((await draw()) as unknown as Draw)(app, transfer, request);

export default route({ get: frame, post: frame } as never);
