import response from "primate/response";
import route from "primate/route";
import { send } from "#api/client.ts";
import { csrf, csrfOk, current, isAdmin } from "#auth/readers.ts";
import { bearer } from "#auth/signed-in.ts";
import { UUID, write } from "#lib/comments.ts";
import { meta } from "#lib/meta.ts";
import { datedSlug, notFound } from "#lib/post-page.ts";

/* An admin's removal of a comment: removed, it shows as deleted with its replies kept; deleted for
   good (hard), it's gone. Asked first, on a page of its own, so it works without script. */
export default route({
  get(request) {
    const id = request.path.get("id");
    const slug = datedSlug(request.query.try("post"));
    if (!slug || !UUID.test(id) || !isAdmin(current())) return notFound();
    const hard = request.query.try("hard") === "true";
    const back = `/posts/${slug}#comment-${id}`;
    return response.view("Confirm.marko", hard ? {
      title: "Delete this comment for good? This cannot be undone.",
      body: "The comment and its text are gone from the thread.",
      action: `/comments/${id}/remove`, fields: { post: slug, hard: "true" }, button: "Delete for good", back, csrf: csrf(),
    } : {
      title: "Remove this comment?",
      body: "It shows as deleted, and its replies stay.",
      action: `/comments/${id}/remove`, fields: { post: slug }, button: "Remove", back, csrf: csrf(),
      onward: { text: "Delete it for good instead…", href: `/comments/${id}/remove?post=${encodeURIComponent(slug)}&hard=true` },
    }, {
      headers: { "Cache-Control": "private, no-store" },
      placeholders: { meta: meta({ title: hard ? "Delete comment" : "Remove comment" }) },
    });
  },

  async post(request) {
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    const id = request.path.get("id");
    const slug = datedSlug(form.post);
    if (!slug || !UUID.test(id) || !isAdmin(current())) return notFound();
    const hard = form.hard === "true";
    return write(slug, null,
      (access) => send("DELETE", `/admin/comments/${id}${hard ? "?hard=true" : ""}`, undefined, bearer(access)),
      async () => `/posts/${slug}#comments`);
  },
});
