import response from "primate/response";
import { headTags, meta, type Meta } from "#lib/meta.ts";

type Options = NonNullable<Parameters<typeof response.view>[2]>;

/* response.view, for a page that says what it is: its props' `meta` (#lib/meta.ts) is what the
   head should say. The view applies it in the browser (views/tags/page-meta.marko), after a
   client-side navigation, whose JSON carries a view's props but not the head. The server's render
   has its head drawn here, into %meta% (templates/app.html): a view draws only the body, and a
   crawler or link preview reads the head without running any script. */
export function view(name: string, props: Record<string, unknown> & { meta?: Meta & { robots?: string } } = {}, options: Options = {}) {
  if (!props.meta) return response.view(name, props, options);
  const head = meta(props.meta);
  return response.view(name, { ...props, meta: head }, { ...options, placeholders: { ...options.placeholders, meta: headTags(head) } });
}
