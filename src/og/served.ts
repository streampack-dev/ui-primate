/* The cards as served: the site's drawn once, posts' drawn when first asked for and then kept,
   by what they show, so an edited post gets a new one (as ui-pudl keeps them). */
import { cardLines, postCard, siteCard, type CardLines } from "./cards.ts";

const KEPT = 256;
const posts = new Map<string, Promise<Uint8Array>>();
let site: Promise<Uint8Array> | null = null;

export function siteImage(): Promise<Uint8Array> {
  return (site ??= siteCard().catch((e) => { site = null; throw e; }));
}

export function postImage(post: Parameters<typeof cardLines>[0]): Promise<Uint8Array> {
  const lines: CardLines = cardLines(post);
  const key = JSON.stringify(lines);
  let drawn = posts.get(key);
  if (drawn) {
    // Most recently asked for goes to the back, so the oldest is the first let go.
    posts.delete(key);
  } else {
    drawn = postCard(lines).catch((e) => { posts.delete(key); throw e; });
  }
  posts.set(key, drawn);
  while (posts.size > KEPT) posts.delete(posts.keys().next().value!);
  return drawn;
}

/** A card as a response, kept by caches for an hour and served stale for a day while it's redrawn. */
export function png(bytes: Uint8Array): Response {
  return new Response(bytes, {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
