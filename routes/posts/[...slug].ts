import response from "primate/response";
import route from "primate/route";
import { ApiUnavailable, cachedGet } from "#api/client.ts";
import type { CommentNode, CommentThread, ContentDetail } from "#api/types.ts";
import { formatDate, formatUpdatedTime } from "#lib/format.ts";
import { meta } from "#lib/meta.ts";

const SUMMARY_FALLBACK = "Read the latest content on bytecode.news.";

/* The thread as the view draws it: who, when, what, and the replies under it. */
type Comment = { id: string; author: string; date: string; html: string; deleted: boolean; replies: Comment[] };
function thread(nodes: CommentNode[] = []): Comment[] {
  return nodes.map((n) => ({
    id: n.id || "",
    author: n.authorDisplayName || "",
    date: formatDate(n.createdAt),
    html: n.renderedHtml || "",
    deleted: !!n.deleted,
    replies: thread(n.children),
  }));
}

/* A post (/posts/{year}/{month}/{slug}) or one of the site's own pages (/posts/{slug}), its
   comments under it. A post at an old address moves to its own for good. */
export default route({
  async get(request) {
    const path = request.path.get("slug");
    const [year, month, ...rest] = path.split("/");
    const dated = !!(year && month && rest.length);

    let post: ContentDetail | null;
    try {
      post = await cachedGet<ContentDetail>(dated ? `/posts/${path}` : `/pages/${encodeURIComponent(path)}`);
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e;
      return response.view("PostUnavailable.marko", {}, { status: 503, placeholders: { meta: meta({ title: "Post Unavailable" }) } });
    }
    if (!post) {
      return response.view("NotFound.marko", {}, { status: 404, placeholders: { meta: meta({ title: "Not Found" }) } });
    }
    if (post.slug && post.slug !== path) return response.redirect(`/posts/${post.slug}`, 301);

    const commentsAllowed = !(post.categories || []).includes("_sidebar");
    let comments: CommentThread | null = null;
    if (commentsAllowed) {
      try {
        comments = await cachedGet<CommentThread>(`/posts/${path}/comments`);
      } catch {
        // The post shows even when its comments can't be had.
      }
    }

    return response.view("Post.marko", {
      id: post.id,
      title: post.title,
      author: post.authorDisplayName,
      published: post.publishedAt,
      date: formatDate(post.publishedAt),
      updated: formatUpdatedTime(post.updatedAt),
      tags: post.tags || [],
      html: post.renderedHtml || "",
      commentsAllowed,
      commentsAvailable: comments !== null,
      commentCount: comments?.totalActiveCount ?? 0,
      comments: thread(comments?.comments),
    }, {
      placeholders: {
        meta: meta({
          title: post.title,
          description: post.excerpt?.trim() || SUMMARY_FALLBACK,
          path: `/posts/${post.slug}`,
          type: "article",
          // A dated post has its own drawn card; a page keeps the site's.
          ...(dated ? { image: { path: `/og/posts/${post.slug}.png`, alt: post.title || "" } } : {}),
        }),
      },
    });
  },
});
