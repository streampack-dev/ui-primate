import response from "primate/response";
import route from "primate/route";
import { send } from "#api/client.ts";
import { refusal } from "#auth/forms.ts";
import { csrf, csrfOk } from "#auth/readers.ts";
import { asReader, bearer, SignInRequired } from "#auth/signed-in.ts";
import { admitted, categories, editorPage, formData, formOf, load, notFound } from "#lib/editor.ts";
import { meta } from "#lib/meta.ts";

/* Deleting a post, asked first: softly, to the Deleted list, or for good (hard), asked again. */
export default route({
  async get(request) {
    const id = admitted(request.path.get("id"));
    const post = id ? await load(id).catch(() => null) : null;
    if (!id || !post) return notFound();
    const hard = request.query.try("hard") === "true";
    return response.view("Confirm.marko", hard ? {
      title: "Permanently delete this post? This cannot be undone.",
      body: `“${post.title}” goes for good.`,
      action: `/edit/${id}/delete`, fields: { hard: "true" }, button: "Delete for good", back: `/edit/${id}`, csrf: csrf(),
    } : {
      title: "Delete this post? It can be restored later.",
      body: `“${post.title}” moves to the Deleted list.`,
      action: `/edit/${id}/delete`, fields: {}, button: "Delete", back: `/edit/${id}`, csrf: csrf(),
      onward: { text: "Delete it for good instead…", href: `/edit/${id}/delete?hard=true` },
    }, { headers: { "Cache-Control": "private, no-store" }, placeholders: { meta: meta({ title: "Delete post" }) } });
  },

  async post(request) {
    const id = admitted(request.path.get("id"));
    if (!id) return notFound();
    const data = await formData(request);
    if (!csrfOk(data.one("csrf"))) return new Response("Forbidden", { status: 403 });
    const hard = data.one("hard") === "true";
    try {
      const answer = await asReader((a) => send("DELETE", `/admin/posts/${id}${hard ? "?hard=true" : ""}`, undefined, bearer(a)));
      if (answer.ok) return response.redirect("/admin/pending", 303);
      const post = await load(id);
      if (!post) return notFound();
      return editorPage(id, post, { form: formOf(post, await categories()), notice: await refusal(answer, "The post wasn't deleted.") }, 400);
    } catch (e) {
      if (e instanceof SignInRequired) return response.redirect(`/login?return=${encodeURIComponent(`/edit/${id}`)}`, 303);
      throw e;
    }
  },
});
