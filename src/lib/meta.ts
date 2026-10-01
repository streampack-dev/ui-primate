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
  /** A preview image's address on the site, from its root, and what it shows. */
  image?: { path: string; alt: string };
};

export function meta({ title, description = DESCRIPTION, path, type = "website", image }: Meta = {}): string {
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
  if (path) {
    tags.push(`<link rel="canonical" href="${escape(siteUrl() + path)}">`, `<meta property="og:url" content="${escape(siteUrl() + path)}">`);
  }
  if (image) {
    tags.push(`<meta property="og:image" content="${escape(siteUrl() + image.path)}">`, `<meta property="og:image:alt" content="${escape(image.alt)}">`);
  }
  return tags.join("\n    ");
}
