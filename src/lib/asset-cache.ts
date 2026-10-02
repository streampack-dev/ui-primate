/* How long browsers keep the files Primate serves itself (client/'s bundles, static/'s icons),
   which it sends with no Cache-Control and so are fetched again on every page. A bundle's name
   carries a hash of what's in it (theme-4PFJVPRE.js), so a changed bundle is a new address and
   the old one can be kept for good. static/'s files keep their names, so they're kept a day.
   Anything that says for itself how it's kept (a page, a card) is left as it is.

   Primate serves these files before routes and their hooks see the request, so this is a module
   (config/app.ts), around everything. */

const BUNDLE = /-[A-Z0-9]{8}\.(js|css|woff2)$/;
const STATIC = /\.(png|ico|svg|webmanifest)$/;

/** The Cache-Control for [pathname], when it's one of Primate's own files; undefined otherwise. */
export function assetCacheControl(pathname: string): string | undefined {
  if (BUNDLE.test(pathname)) return "public, max-age=31536000, immutable";
  if (STATIC.test(pathname)) return "public, max-age=86400";
  return undefined;
}

type Handle = (request: { url: URL }, next: (request: unknown) => Promise<Response>) => Promise<Response>;

export default {
  name: "asset-cache",
  setup({ onHandle }: { onHandle: (hook: Handle) => void }) {
    onHandle(async (request, next) => {
      const response = await next(request);
      const control = assetCacheControl(request.url.pathname);
      if (!control || !response.ok || response.headers.has("Cache-Control")) return response;
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", control);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    });
  },
};
