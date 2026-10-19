/* Comments on a passage (#65, streampack#256), as Medium, Google Docs and Substack show them. The
   interface is clientjs's annotate module (streampack-dev/clientjs, #76), the same in ui-pudl: the
   button beside a selection, the quote in the form, the marks, and callouts in the space beside the
   centred post when there's room (16rem) or markers after the passage's paragraph when there isn't,
   linked both ways. The post never moves for them.

   This is the site's part: its selectors, a refusal shown in the button's status line, and setting
   up each post's page as it's shown. A comment whose passage an edit removed is left to the server,
   which marks it "no longer in the post". Without script, nothing here happens: the form takes no
   quote, and the thread shows each quote as the API rendered it. */
import { annotate } from "@streampack-dev/clientjs/annotate";
import { eachPage } from "./each-page.ts";

const passages = annotate({
  container: ".post-article",
  body: ":scope > [data-anchor-body]",
  comment: ".comment-list > article.comment",
  form: "form.comment-form",
  meta: ":scope > .meta",
  author: ":scope > .meta .comment-author",
  linkClass: "form-helper",
  refuse: (post, message) => {
    const note = post.querySelector("[data-anchor-note]");
    if (note) note.textContent = message;
  },
});

eachPage(() => {
  const post = document.querySelector<HTMLElement>(".post-article");
  if (post) passages.setUp(post);
});
