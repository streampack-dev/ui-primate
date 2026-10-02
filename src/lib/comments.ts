/* Writing to a post's thread, as a plain form post: a comment, a reply, an edit, a removal. Each
   returns to the thread. A refusal (an unverified email, an edit window passed) is the reader's
   to fix, so the post's page is drawn again with the API's reason beside their draft. */
import response from "primate/response";
import { refusal } from "#auth/forms.ts";
import { current } from "#auth/readers.ts";
import { asReader, SignInRequired } from "#auth/signed-in.ts";
import { postPage, type CommentForm } from "#lib/post-page.ts";

const login = (slug: string) => `/login?return=${encodeURIComponent(`/posts/${slug}`)}`;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sends [call] as the reader for the thread of post [slug], then goes to where [done] says. */
export async function write(slug: string, form: CommentForm | null, call: (access: string) => Promise<Response>, done: (answer: Response) => Promise<string>) {
  if (!current()) return response.redirect(login(slug), 303);
  const again = (error: string, status: number) => form ? postPage(slug, { ...form, error }, status) : postPage(slug, undefined, status);
  if (form && !form.draft.trim()) return again("There was nothing in the comment.", 400);

  let answer: Response;
  try {
    answer = await asReader(call);
  } catch (e) {
    if (e instanceof SignInRequired) return response.redirect(login(slug), 303);
    answer = new Response(null, { status: 503 });
  }
  if (answer.ok) return response.redirect(await done(answer), 303);
  if (answer.status >= 500) return again("Your comment couldn't be posted just now. Try again shortly; your draft is kept here.", 503);
  return again(await refusal(answer, "The news service didn't accept that. Try again in a moment."), 400);
}
