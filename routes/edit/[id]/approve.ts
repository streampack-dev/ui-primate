import response from "primate/response";
import route from "primate/route";
import { send } from "#api/client.ts";
import { refusal } from "#auth/forms.ts";
import { csrf, csrfOk } from "#auth/readers.ts";
import { asReader, bearer, SignInRequired } from "#auth/signed-in.ts";
import { admitted, categories, editorPage, formData, formOf, fromLocal, load, notFound, toLocal } from "#lib/editor.ts";
import { meta } from "#lib/meta.ts";

/* Approving a draft, asked first, with when to publish it (UTC, now unless changed). It's published
   as last saved. */
export default route({
  async get(request) {
    const id = admitted(request.path.get("id"));
    const post = id ? await load(id).catch(() => null) : null;
    if (!id || !post) return notFound();
    return response.view("Confirm.marko", {
      title: `Approve “${post.title}”?`,
      body: "It's published as last saved, on the date below. Save any changes first.",
      action: `/edit/${id}/approve`, fields: {}, button: "Approve and publish", back: `/edit/${id}`, csrf: csrf(),
      field: { name: "publishedAt", label: "Publish at (UTC)", type: "datetime-local", value: toLocal(new Date().toISOString()) },
      tone: "go",
    }, { headers: { "Cache-Control": "private, no-store" }, placeholders: { meta: meta({ title: "Approve post" }) } });
  },

  async post(request) {
    const id = admitted(request.path.get("id"));
    if (!id) return notFound();
    const data = await formData(request);
    if (!csrfOk(data.one("csrf"))) return new Response("Forbidden", { status: 403 });
    const at = fromLocal(data.one("publishedAt").trim()) ?? new Date();
    try {
      const answer = await asReader((a) => send("PUT", `/admin/posts/${id}/approve`, { publishedAt: at.toISOString() }, bearer(a)));
      if (answer.ok) return response.redirect(`/edit/${id}?approved`, 303);
      const post = await load(id);
      if (!post) return notFound();
      return editorPage(id, post, { form: formOf(post, await categories()), notice: await refusal(answer, "The post wasn't approved.") }, 400);
    } catch (e) {
      if (e instanceof SignInRequired) return response.redirect(`/login?return=${encodeURIComponent(`/edit/${id}`)}`, 303);
      throw e;
    }
  },
});
