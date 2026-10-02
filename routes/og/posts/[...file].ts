import route from "primate/route";
import { ApiUnavailable, cachedGet } from "#api/client.ts";
import type { ContentDetail } from "#api/types.ts";
import { png, postImage } from "#og/served.ts";

/* A post's link-preview card at /og/posts/{year}/{month}/{slug}.png, the address ui-pudl and
   ui-nextjs use; the post's page names it. Only dated posts have one. */
export default route({
  async get(request) {
    const match = /^(\d{4}\/\d{1,2}\/[A-Za-z0-9._~-]+)\.png$/.exec(request.path.get("file"));
    if (!match) return new Response("Not found", { status: 404 });
    let post: ContentDetail | null;
    try {
      post = await cachedGet<ContentDetail>(`/posts/${match[1]}`);
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e;
      return new Response("Card unavailable", { status: 503 });
    }
    if (!post?.title) return new Response("Not found", { status: 404 });
    return png(await postImage(post));
  },
});
