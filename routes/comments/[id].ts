import route from "primate/route";
import { send } from "#api/client.ts";
import { csrfOk } from "#auth/readers.ts";
import { bearer } from "#auth/signed-in.ts";
import { UUID, write } from "#lib/comments.ts";
import { datedSlug, notFound } from "#lib/post-page.ts";

/* An edit of the reader's own comment (or any, for an admin); [post] is its post's slug. */
export default route({
  async post(request) {
    const form = await request.body.form() as Record<string, string>;
    if (!csrfOk(form.csrf)) return new Response("Forbidden", { status: 403 });
    const id = request.path.get("id");
    const slug = datedSlug(form.post);
    if (!slug || !UUID.test(id)) return notFound();
    const draft = form.markdownSource || "";

    return write(slug, { kind: "edit", id, draft, error: "" },
      (access) => send("PUT", `/comments/${id}`, { markdownSource: draft }, bearer(access)),
      async () => `/posts/${slug}#comment-${id}`);
  },
});
