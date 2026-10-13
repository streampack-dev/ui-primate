import response from "primate/response";
import route from "primate/route";
import { refusal } from "#auth/forms.ts";
import { tokens } from "#auth/readers.ts";
import { SignInRequired } from "#auth/signed-in.ts";
import { MAX_BYTES } from "#lib/audio.ts";
import { admitted, categories, editorPage, formOf, load, notFound } from "#lib/editor.ts";
import { drain, OVERHEAD, relay, TOO_BIG } from "#lib/recording.ts";

const SIGN_IN = (id: string) => `/login?return=${encodeURIComponent(`/edit/${id}`)}`;

/** The API's word on a refused recording: its problem detail, or, when it has none, by status. */
function refused(status: number): string {
  switch (status) {
    case 413: return "The recording is too large: the API takes files up to 100 MB.";
    case 415: return "That file isn't a recording the API accepts: MP3, M4A, Ogg Vorbis or Ogg Opus.";
    case 503: return "The API can't store recordings just now: its media storage isn't set up.";
    case 409: return "Another upload of this recording was being stored. Try again.";
    case 404: return "The post isn't there any more.";
    default: return "The recording wasn't uploaded.";
  }
}

/* Attaching or replacing a post's recording (#33), from the editor's Recording form: passed on to
   the API as it arrives (src/lib/recording.ts). The editor then says what was done, or, refused,
   why, beside the recording. */
export default route({
  async post(request) {
    const body = request.original.body;
    const id = admitted(request.path.get("id"));
    if (!id) {
      await drain(body);
      return notFound();
    }
    const contentType = request.headers.try("content-type") || "";
    const length = Number(request.headers.try("content-length") || "0");

    // The post, as the admin, which renews their token if it's run out: the upload itself is sent
    // once, since what's been read of it can't be read again.
    let post;
    try {
      post = await load(id);
    } catch (e) {
      await drain(body);
      if (e instanceof SignInRequired) return response.redirect(SIGN_IN(id), 303);
      throw e;
    }
    const access = tokens()?.access;
    if (!post || !access) {
      await drain(body);
      return post ? response.redirect(SIGN_IN(id), 303) : notFound();
    }
    const again = async (notice: string, status: number) =>
      editorPage(id, post, { form: formOf(post, await categories()), audio: { notice } }, status);

    if (!/^multipart\/form-data\b/i.test(contentType) || !body) {
      await drain(body);
      return again("Choose a recording to upload.", 400);
    }
    // Said to be too big, it's refused before any of it is sent on.
    if (length > MAX_BYTES + OVERHEAD) {
      await drain(body);
      return again(TOO_BIG, 413);
    }

    const relayed = await relay(id, body, contentType, access);
    if (relayed.kind === "forbidden") return new Response("Forbidden", { status: 403 });
    if (relayed.kind === "refused") return again(relayed.notice, relayed.status);
    const answer = relayed.response;
    if (answer.status === 401) return response.redirect(SIGN_IN(id), 303);
    if (answer.ok) return response.redirect(`/edit/${id}?audio=${answer.status === 201 ? "attached" : "replaced"}#recording`, 303);
    return again(await refusal(answer, refused(answer.status)), answer.status >= 500 ? 503 : 400);
  },
});
