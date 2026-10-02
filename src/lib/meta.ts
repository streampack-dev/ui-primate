/* A page's title and its description for browsers and link previews, as the head's %meta%
   placeholder takes it (templates/app.html). Every value is escaped, and so is "%": Primate empties
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

export function meta({ title, description = DESCRIPTION, path, type = "website", image, robots }: Meta & { robots?: string } = {}): string {
  const full = title ? `${title} | ${SITE}` : SITE;
  const tags = [
    `<title>${escape(full)}</title>`,
    `<meta name="description" content="${escape(description)}">`,
    `<meta property="og:site_name" content="${SITE}">`,
    `<meta property="og:title" content="${escape(title || SITE)}">`,
    `<meta property="og:description" content="${escape(description)}">`,
    `<meta property="og:type" content="${type}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<link rel="alternate" type="application/rss+xml" title="${SITE}" href="/feed.xml">`,
  ];
  if (robots) tags.push(`<meta name="robots" content="${escape(robots)}">`);
  if (path) {
    tags.push(`<link rel="canonical" href="${escape(siteUrl() + path)}">`, `<meta property="og:url" content="${escape(siteUrl() + path)}">`);
  }
  // Every page has a preview image: its own (a post's card), else the site's.
  const shown = image ?? { path: "/og/site.png", alt: SITE };
  const src = escape(siteUrl() + shown.path);
  tags.push(
    `<meta property="og:image" content="${src}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${escape(shown.alt)}">`,
    `<meta name="twitter:image" content="${src}">`,
    `<meta name="twitter:image:alt" content="${escape(shown.alt)}">`,
  );
  return tags.join("\n    ");
}
