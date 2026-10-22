/* The profile page, drawn for a visit and again for a refused form, with what was typed. */
import type { ContentList } from "#api/types.ts";
import { csrf, current, isAdmin, type Reader } from "#auth/readers.ts";
import { getAsReader } from "#auth/signed-in.ts";
import { authorHref } from "#lib/authors.ts";
import { formatDate } from "#lib/format.ts";
import { view } from "#lib/view.ts";

export const SIGN_IN = "/login?return=%2Fprofile";

export type ProfileState = {
  status?: string;
  nameError?: string;
  nameDraft?: string;
  deleteOpen?: boolean;
  deleteError?: string;
  confirmDraft?: string;
  exportError?: string;
};

/** One of the reader's own posts (#88): its state in words, and where it opens, if anywhere. */
export type OwnPost = { id: string; title: string; state: string; date: string; published: string; href: string | null };

const STATES: Record<string, string> = { PUBLISHED: "Published", SCHEDULED: "Scheduled", DRAFT: "Draft" };

/**
 * The reader's own posts, newest first, from GET /auth/posts (streampack#273), or null when they
 * can't be had. A published post opens as itself; an unpublished one opens in the editor for an
 * admin, who can use it, and isn't a link for anyone else.
 */
export async function ownPosts(reader: Reader): Promise<OwnPost[] | null> {
  let list: ContentList | null;
  try {
    list = await getAsReader<ContentList>("/auth/posts", { page: 0, size: 20 });
  } catch {
    return null;
  }
  return (list?.posts || []).map((p) => {
    const state = p.state || "PUBLISHED";
    return {
      id: p.id || "",
      title: p.title || "",
      state: STATES[state] || state,
      date: p.publishedAt ? formatDate(p.publishedAt) : "",
      published: p.publishedAt || "",
      href: state === "PUBLISHED" ? `/posts/${p.slug}` : isAdmin(reader) && p.id ? `/edit/${p.id}` : null,
    };
  });
}

export async function profilePage(state: ProfileState = {}, status = 200) {
  const reader = current()!;
  const posts = await ownPosts(reader);
  return view("Profile.marko", {
    reader,
    csrf: csrf(),
    ...state,
    nameDraft: state.nameDraft ?? reader.displayName,
    posts,
    authorPage: authorHref(reader.userId),
    meta: { title: "Profile" },
  }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
