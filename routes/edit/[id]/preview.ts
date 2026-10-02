import route from "primate/route";
import { admitted, formData } from "#lib/editor.ts";
import { preview } from "#lib/preview.ts";

/* The live preview: the Markdown as typed, rendered here, as the preview's HTML (client/editor.ts
   asks as the admin types). It asks the API for nothing, so typing costs streampack nothing. */
export default route({
  async post(request) {
    if (!admitted(request.path.get("id"))) return new Response("Not found", { status: 404 });
    const data = await formData(request);
    return new Response(preview(data.one("markdownSource")), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  },
});
