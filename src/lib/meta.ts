/* A page's title and its description for browsers and link previews: what a route puts in its
   view's `meta` (#lib/view.ts), resolved here, and drawn by views/tags/page-meta.marko with
   Primate's <Head>, which escapes every value. */
export const SITE = "ByteCode.News";
const DESCRIPTION = "ByteCode.News: articles, knowledge, and community context.";

/** Where the site is, for addresses a link preview fetches: SITE_URL (default the live site). */
export function siteUrl(): string {
  return (process.env.SITE_URL || "https://bytecode.news").replace(/\/$/, "");
}

export type Meta = {
  /** The page's own title, before " | ByteCode.News"; none for the site's front page. */
  title?: string;
  description?: string;
  /** The page's address on the site, from its root. */
  path?: string;
  type?: "website" | "article";
  /** A preview image's address on the site, from its root, and what it shows; the site's card by default. */
  image?: { path: string; alt: string };
};

/** What a page's head says, resolved: drawn by views/tags/page-meta.marko, on the server and in the browser. */
export type Head = {
  /** The whole title, " | ByteCode.News" and all. */
  title: string;
  ogTitle: string;
  description: string;
  type: "website" | "article";
  robots: string | null;
  /** The page's whole address on the site, if it has one to name. */
  url: string | null;
  image: string;
  imageAlt: string;
};

export function meta({ title, description = DESCRIPTION, path, type = "website", image, robots }: Meta & { robots?: string } = {}): Head {
  // Every page has a preview image: its own (a post's card), else the site's.
  const shown = image ?? { path: "/og/site.png", alt: SITE };
  return {
    title: title ? `${title} | ${SITE}` : SITE,
    ogTitle: title || SITE,
    description,
    type,
    robots: robots ?? null,
    url: path ? siteUrl() + path : null,
    image: siteUrl() + shown.path,
    imageAlt: shown.alt,
  };
}

/** Google Analytics' tags, as the head's %analytics% placeholder takes them (templates/app.html). */
export function analyticsTags(): string {
  return analytics().join("\n    ");
}

/* Google Analytics, as ui-nextjs and ui-pudl load it (deploy#3): gtag on every page when
   GA_MEASUREMENT_ID is set (read at run time), and nothing of Google's at all when it isn't. The id
   is written into a script, so only one shaped like a measurement id is used; anything else turns
   analytics off, said once in the log. */
const MEASUREMENT_ID = /^[A-Z]{1,3}-[A-Z0-9]{4,16}$/;
let warnedAbout: string | null = null;

function analytics(): string[] {
  const id = (process.env.GA_MEASUREMENT_ID || "").trim();
  if (!id) return [];
  if (!MEASUREMENT_ID.test(id)) {
    if (warnedAbout !== id) {
      warnedAbout = id;
      console.warn("GA_MEASUREMENT_ID isn't a measurement id (G-XXXXXXXX); analytics is off.");
    }
    return [];
  }
  return [
    `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>`,
    `<script>window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', '${id}');</script>`,
  ];
}
