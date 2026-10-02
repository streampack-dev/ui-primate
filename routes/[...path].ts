import route from "primate/route";
import { notFound } from "#lib/post-page.ts";

/* An address nothing else answers: the site's own Not Found page, framed like the rest (with its
   head, analytics too), rather than Primate's bare one. */
const missing = () => notFound();
export default route({ get: missing, post: missing });
