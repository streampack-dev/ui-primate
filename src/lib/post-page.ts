/* A post's page: the post, and its comments under it, with the forms to add to them. It's drawn for
   a visit (routes/posts/[...slug].ts) and again for a comment the API refused, with the reader's
   draft and the reason, where they wrote it (routes/posts/.../comments.ts, routes/comments/). */
import response from "primate/response";
import { NETWORKS, shareText } from "@streampack-dev/clientjs/share";
import { ApiUnavailable, cachedGet, send } from "#api/client.ts";
import type { CommentNode, CommentThread, ContentDetail } from "#api/types.ts";
import { csrf, current, isAdmin } from "#auth/readers.ts";
import { asReader, bearer } from "#auth/signed-in.ts";
import { audioOf } from "#lib/audio.ts";
import { authorHref } from "#lib/authors.ts";
import { formatDate, formatUpdatedTime } from "#lib/format.ts";
import { siteUrl } from "#lib/meta.ts";
import { view } from "#lib/view.ts";

const SUMMARY_FALLBACK = "Read the latest content on bytecode.news.";

/** The passage a new comment quotes (#65), as the form's hidden fields carry it. */
export type QuoteDraft = { exact: string; prefix: string; suffix: string };

/** A comment form being shown again: a new comment (with the passage it quotes, if any), a reply to [id], or an edit of [id]. */
export type CommentForm = { kind: "new" | "reply" | "edit"; id?: string; draft: string; error: string; anchor?: QuoteDraft };

/* The thread as the view draws it: who, when, what, whether the reader may edit it (and what they
   wrote, to edit), the passage it quotes and whether that's still in the post (#65), and the
   replies under it. */
type Comment = {
  id: string; author: string; date: string; html: string; deleted: boolean; editable: boolean; markdown: string;
  anchor: { exact: string; prefix: string; suffix: string; found: boolean } | null;
  replies: Comment[];
};
function thread(nodes: CommentNode[] = []): Comment[] {
  return nodes.map((n) => ({
    id: n.id || "",
    author: n.authorDisplayName || "",
    date: formatDate(n.createdAt),
    html: n.renderedHtml || "",
    deleted: !!n.deleted,
    editable: !!n.editable,
    markdown: n.markdownSource || "",
    anchor: n.anchor && !n.deleted
      ? { exact: n.anchor.exact, prefix: n.anchor.prefix || "", suffix: n.anchor.suffix || "", found: !!n.anchorFound }
      : null,
    replies: thread(n.children),
  }));
}

/** A dated post's address, `2026/09/some-title`, if [slug] is one. */
export function datedSlug(slug: unknown): string | null {
  return typeof slug === "string" && /^\d{4}\/\d{1,2}\/[A-Za-z0-9._~-]+$/.test(slug) ? slug : null;
}

/** The thread, read as the signed-in reader (so the API says which comments are theirs), else as anyone. */
async function comments(slug: string): Promise<CommentThread | null> {
  if (current()) {
    try {
      const answer = await asReader((a) => send("GET", `/posts/${slug}/comments`, undefined, bearer(a)));
      if (answer.ok) return await answer.json() as CommentThread;
    } catch {
      // Read as anyone, below.
    }
  }
  try {
    return await cachedGet<CommentThread>(`/posts/${slug}/comments`);
  } catch {
    // The post shows even when its comments can't be had.
    return null;
  }
}

/** The page for [path] (a dated post's slug, or one of the site's own pages), with [form] shown again. */
export async function postPage(path: string, form?: CommentForm, status = 200) {
  const [year, month, ...rest] = path.split("/");
  const dated = !!(year && month && rest.length);

  let post: ContentDetail | null;
  try {
    post = await cachedGet<ContentDetail>(dated ? `/posts/${path}` : `/pages/${encodeURIComponent(path)}`);
  } catch (e) {
    if (!(e instanceof ApiUnavailable)) throw e;
    return view("PostUnavailable.marko", { meta: { title: "Post Unavailable" } }, { status: 503 });
  }
  if (!post) return notFound();
  if (post.slug && post.slug !== path) return response.redirect(`/posts/${post.slug}`, 301);

  const commentsAllowed = !(post.categories || []).includes("_sidebar");
  const thread_ = commentsAllowed ? await comments(path) : null;
  const reader = current();

  return view("Post.marko", {
    id: post.id,
    slug: path,
    title: post.title,
    author: post.authorDisplayName,
    // The author's page (#88), when the API says who they are.
    authorHref: authorHref(post.authorId),
    published: post.publishedAt,
    date: formatDate(post.publishedAt),
    updated: formatUpdatedTime(post.updatedAt),
    updatedAt: post.updatedAt,
    tags: post.tags || [],
    html: post.renderedHtml || "",
    // Its recording, if it has one (#33).
    audio: audioOf(post.versions),
    // An admin's way to the editor.
    editHref: isAdmin(reader) && post.id ? `/edit/${post.id}` : null,
    // Share to (#98): BCN's text and each network's page, from clientjs's share module, so the
    // menu's links work without script. A dated post only; the site's own pages aren't shared so.
    share: dated ? shareOf(post.excerpt, `${siteUrl()}/posts/${post.slug}`) : null,
    commentsAllowed,
    // Only a dated post takes comments, so only it takes one on a passage (#65).
    quotable: dated,
    commentsAvailable: thread_ !== null,
    commentCount: thread_?.totalActiveCount ?? 0,
    comments: thread(thread_?.comments),
    // Who may do what in the thread, and the form being shown again, if any.
    talk: {
      slug: path,
      signedIn: !!reader,
      admin: isAdmin(reader),
      csrf: reader ? csrf() : "",
      form: form ?? null,
      login: `/login?return=${encodeURIComponent(`/posts/${path}`)}`,
    },
    meta: {
      title: post.title,
      description: post.excerpt?.trim() || SUMMARY_FALLBACK,
      path: `/posts/${post.slug}`,
      type: "article",
      // A dated post has its own drawn card; a page keeps the site's.
      ...(dated ? { image: { path: `/og/posts/${post.slug}.png`, alt: post.title || "" } } : {}),
    },
  }, {
    status,
    // A signed-in reader's page is theirs: their forms' token, their own comments' edit forms.
    headers: reader ? { "Cache-Control": "private, no-store" } : {},
  });
}

/** A post's Share to menu (#98): the text, and each network's share page for it. */
export function shareOf(excerpt: string | null | undefined, url: string) {
  const text = shareText({ dek: excerpt, url });
  return { text, networks: NETWORKS.map((n) => ({ id: n.id, name: n.name, page: n.page(text, url) })) };
}

export function notFound() {
  return view("NotFound.marko", { meta: { title: "Not Found" } }, { status: 404 });
}
