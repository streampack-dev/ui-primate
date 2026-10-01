import route from "primate/route";
import { send } from "#api/client.ts";

/* A reader opened a post: client/read.ts says so here, and it's passed on to the API, which counts
   it toward Popular Reads. Whatever the API says, the reader's page doesn't wait on it. */
export default route({
  async post(request) {
    const id = request.path.get("id");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 400 });
    try {
      await send("POST", `/posts/${id}/access`);
    } catch {
      // Not counted, this time.
    }
    return new Response(null, { status: 204 });
  },
});
