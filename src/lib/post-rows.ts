/* Posts as a list shows them (search, a tag's page, a category's): title, excerpt, byline, date,
   comments and tags, as ui-nextjs's ArticleRow has them. */
import type { ContentList } from "#api/types.ts";
import { formatDate } from "#lib/format.ts";

export type PostRow = {
  id: string; title: string; href: string; excerpt: string; author: string; published: string;
  date: string; comments: string; tags: string[];
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
