/* Posts as a list shows them (search, a tag's page, a category's): title, excerpt, byline, date,
   comments, tags and whether it has a recording, as ui-nextjs's ArticleRow has them. */
import type { ContentList } from "#api/types.ts";
import { listed } from "#lib/audio.ts";
import { formatDate } from "#lib/format.ts";
import { passageHtml } from "#lib/passage.ts";

export type PostRow = {
  id: string; title: string; href: string; excerpt: string; author: string; published: string;
  date: string; comments: string; tags: string[];
  /** Whether it has a recording (#33). */
  audio: boolean;
  /** In search results, why it matched: escaped HTML with <mark>s (#54); "" elsewhere. */
  passage: string;
};

export function postRows(posts: ContentList["posts"] = []): PostRow[] {
  return (posts || []).map((p) => ({
    id: p.id || p.slug || "",
    title: p.title || "",
    href: `/posts/${p.slug}`,
    excerpt: p.excerpt || "",
    author: p.authorDisplayName || "",
    published: p.publishedAt || "",
    date: formatDate(p.publishedAt),
    comments: p.commentCount ? `${p.commentCount} comment${p.commentCount === 1 ? "" : "s"}` : "",
    tags: p.tags || [],
    audio: listed(p.versionKinds),
    passage: passageHtml(p.match),
  }));
}

/** "Page 2 of 3", and the pages either side, for a list [href] gives the address of each page of. */
export function pager(page: number, totalPages: number, href: (page: number) => string) {
  return {
    pages: totalPages > 1 ? `Page ${page + 1} of ${totalPages}` : "",
    prev: page > 0 ? href(page - 1) : null,
    next: page + 1 < totalPages ? href(page + 1) : null,
  };
}

/** A page number asked for: a whole number from 0, else 0. */
export function pageAsked(value: string | undefined): number {
  const asked = Number.parseInt(value || "0", 10);
  return Number.isFinite(asked) && asked >= 0 ? asked : 0;
}
