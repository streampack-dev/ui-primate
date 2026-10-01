/* Programming the stub API (stub-api.ts) from a test, and the API's shapes as the stub serves them. */
import { inject } from "vitest";

const stubUrl = () => inject("stubApi");

/** From now on, a GET of [path] (with at least [query]) answers [answer]. */
export async function stub(path: string, body: unknown, options: { query?: Record<string, string | number>; status?: number; headers?: Record<string, string>; delayMs?: number } = {}) {
  const query = Object.fromEntries(Object.entries(options.query || {}).map(([k, v]) => [k, String(v)]));
  await fetch(`${stubUrl()}/__stub`, {
    method: "POST",
    body: JSON.stringify({ path, query, answer: { body, status: options.status, headers: options.headers, delayMs: options.delayMs } }),
  });
}

export async function resetStubs() {
  await fetch(`${stubUrl()}/__reset`, { method: "POST" });
}

export async function requests(): Promise<{ method: string; path: string; query: Record<string, string>; headers: Record<string, string> }[]> {
  return (await fetch(`${stubUrl()}/__requests`)).json();
}

let ids = 0;
/** A post as /posts lists it; anything not given is filled in. */
export function post(fields: Partial<Record<string, unknown>> = {}) {
  const n = ++ids;
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
    title: `Post ${n}`,
    slug: `2026/09/post-${n}`,
    excerpt: `What post ${n} is about.`,
    authorDisplayName: "dreamreal",
    publishedAt: "2026-09-21T15:00:00Z",
    commentCount: 0,
    tags: [],
    categories: [],
    ...fields,
  };
}

export function list(posts: unknown[], page = 0, totalPages = 1) {
  return { posts, page, totalPages, totalCount: posts.length };
}

/** The site's features, as /features answers: RSS and factoids on unless said otherwise. */
export function features(fields: Partial<Record<string, unknown>> = {}) {
  return {
    siteName: "ByteCode.News",
    version: { name: "streampack", version: "1.5.0", commit: "abc1234", branch: "main" },
    authentication: { otp: true },
    operationGroups: ["blog", "factoid", "rss"],
    adapters: [],
    ai: true,
    anonymousSubmission: true,
    ...fields,
  };
}

/** What every page needs answered: the features and the sidebar's pages. */
export async function stubSite(fields: Partial<Record<string, unknown>> = {}) {
  await stub("/features", features(fields));
  await stub("/posts", list([post({ title: "About", slug: "about" })]), { query: { category: "_sidebar" } });
}
