import response from "primate/response";
import route from "primate/route";
import { send } from "#api/client.ts";
import { refusal } from "#auth/forms.ts";
import { csrf, csrfOk } from "#auth/readers.ts";
import { asReader, bearer, SignInRequired } from "#auth/signed-in.ts";
import { audioOf, KIND } from "#lib/audio.ts";
import { admitted, categories, editorPage, formData, formOf, load, notFound } from "#lib/editor.ts";
import { view } from "#lib/view.ts";

const SIGN_IN = (id: string) => `/login?return=${encodeURIComponent(`/edit/${id}`)}`;

/* Removing a post's recording (#33), asked first: the recording and its file go, and the post leaves
   the podcast feed. Nothing is kept, so it's back only by uploading it again. */
export default route({
  async get(request) {
    const id = admitted(request.path.get("id"));
    const post = id ? await load(id).catch(() => null) : null;
    if (!id || !post || !audioOf(post.versions)) return notFound();
    return view("Confirm.marko", {
      title: "Remove this post's recording? This cannot be undone.",
      body: `The recording of “${post.title}” and its file go for good, and the post leaves the podcast feed. To have it back, upload it again.`,
      action: `/edit/${id}/audio/remove`, fields: {}, button: "Remove recording", back: `/edit/${id}#recording`, csrf: csrf(),
      meta: { title: "Remove recording" },
    }, { headers: { "Cache-Control": "private, no-store" } });
  },

  async post(request) {
    const id = admitted(request.path.get("id"));
    if (!id) return notFound();
    const data = await formData(request);
    if (!csrfOk(data.one("csrf"))) return new Response("Forbidden", { status: 403 });
    try {
      const answer = await asReader((a) => send("DELETE", `/admin/posts/${id}/versions/${KIND}`, undefined, bearer(a)));
      if (answer.ok) return response.redirect(`/edit/${id}?audio=removed#recording`, 303);
      const post = await load(id);
      if (!post) return notFound();
      const notice = await refusal(answer, answer.status === 404 ? "The post has no recording to remove." : "The recording wasn't removed.");
      return editorPage(id, post, { form: formOf(post, await categories()), audio: { notice } }, answer.status >= 500 ? 503 : 400);
    } catch (e) {
      if (e instanceof SignInRequired) return response.redirect(SIGN_IN(id), 303);
      throw e;
    }
  },
});
