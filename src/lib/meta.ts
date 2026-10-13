/* A page's title and its description for browsers and link previews: what a route puts in its
   view's `meta` (#lib/view.ts), resolved here, and drawn as the head's %meta% placeholder takes it
   (templates/app.html). Every value is escaped, and so is "%": Primate empties
   anything left between two percent signs after it fills the placeholders, which would cut
   "50% faster, 20% smaller" down to "50 smaller". */
const SITE = "ByteCode.News";
const DESCRIPTION = "ByteCode.News: articles, knowledge, and community context.";

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/%/g, "&#37;");
}

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

/** What a page's head says, resolved: drawn into %meta% on the server (headTags), and applied in
   the browser after a client-side navigation (views/tags/page-meta.marko). */
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

/** [head] as the tags %meta% takes, escaped, with analytics. */
export function headTags(head: Head): string {
  const tags = [
    `<title>${escape(head.title)}</title>`,
    `<meta name="description" content="${escape(head.description)}">`,
    `<meta property="og:site_name" content="${SITE}">`,
    `<meta property="og:title" content="${escape(head.ogTitle)}">`,
    `<meta property="og:description" content="${escape(head.description)}">`,
    `<meta property="og:type" content="${head.type}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<link rel="alternate" type="application/rss+xml" title="${SITE}" href="/feed.xml">`,
    // The posts with recordings, for podcast players (#33).
    `<link rel="alternate" type="application/rss+xml" title="${SITE} podcast" href="/podcast.xml">`,
  ];
  if (head.robots) tags.push(`<meta name="robots" content="${escape(head.robots)}">`);
  if (head.url) {
    tags.push(`<link rel="canonical" href="${escape(head.url)}">`, `<meta property="og:url" content="${escape(head.url)}">`);
  }
  const src = escape(head.image);
  tags.push(
    `<meta property="og:image" content="${src}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${escape(head.imageAlt)}">`,
    `<meta name="twitter:image" content="${src}">`,
    `<meta name="twitter:image:alt" content="${escape(head.imageAlt)}">`,
  );
  tags.push(...analytics());
  return tags.join("\n    ");
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
