import route from "primate/route";
import { send } from "#api/client.ts";
import { csrfOk } from "#auth/readers.ts";
import { bearer } from "#auth/signed-in.ts";
import { UUID, write } from "#lib/comments.ts";
import { datedSlug, notFound, postPage } from "#lib/post-page.ts";

/* A post (/posts/{year}/{month}/{slug}) or one of the site's own pages (/posts/{slug}), its
   comments under it. A post at an old address moves to its own for good.

   A comment on a post, or a reply to one of its comments, is posted to the post's address with
   /comments after it. (Primate won't have a route for that beside this one, so it's here.) A new
   comment may quote a passage of the post (#65): the form's anchor fields go to the API as its
   anchor, left out when there's no passage, and never for a reply. */
export default route({
  get(request) {
    return postPage(request.path.get("slug"));
  },

  async post(request) {
    const path = request.path.get("slug");
    const slug = path.endsWith("/comments") ? datedSlug(path.slice(0, -"/comments".length)) : null;
    if (!slug) return notFound();
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    const parent = UUID.test(form.parentCommentId || "") ? form.parentCommentId : null;
    const draft = form.markdownSource || "";
    const quote = !parent && (form.anchorExact || "").trim()
      ? { exact: form.anchorExact, prefix: form.anchorPrefix || "", suffix: form.anchorSuffix || "" }
      : undefined;
    const anchor = quote && { exact: quote.exact, prefix: quote.prefix || null, suffix: quote.suffix || null };

    return write(slug, { kind: parent ? "reply" : "new", id: parent ?? undefined, draft, error: "", anchor: quote },
      (access) => send("POST", `/posts/${slug}/comments`, { markdownSource: draft, ...(parent ? { parentCommentId: parent } : {}), ...(anchor ? { anchor } : {}) }, bearer(access)),
      async (answer) => {
        const made = await answer.json().catch(() => null) as { id?: string } | null;
        return `/posts/${slug}#${made?.id ? `comment-${made.id}` : "comments"}`;
      });
  },
});
