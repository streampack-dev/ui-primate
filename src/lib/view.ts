import response from "primate/response";
import { analyticsTags, meta, type Meta } from "#lib/meta.ts";

type Options = NonNullable<Parameters<typeof response.view>[2]>;

/* response.view, for a page that says what it is: its props' `meta` (#lib/meta.ts) is what the
   head should say, resolved here and drawn by the view's <page-meta> (views/tags/page-meta.marko)
   with Primate's <Head>. Analytics goes into %analytics% (templates/app.html) instead, drawn once
   by the server: it's the same on every page, and a script in <Head> would run again when the
   browser takes the page over. */
export function view(name: string, props: Record<string, unknown> & { meta?: Meta & { robots?: string } } = {}, options: Options = {}) {
  const placeholders = { ...options.placeholders, analytics: analyticsTags() };
  if (!props.meta) return response.view(name, props, { ...options, placeholders });
  return response.view(name, { ...props, meta: meta(props.meta) }, { ...options, placeholders });
}
