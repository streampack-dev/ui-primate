/* A small Atlas as GET /atlas answers it, for the Atlas's page and browser tests: two regions and
   the Uncharted, with a place of each kind and pins of each kind. */
import { stub } from "./stub.ts";

export const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
export const DAY = 24 * 60 * 60 * 1000;

export function atlas() {
  return {
    regions: [
      { id: 1, name: "java · spring", x: 0, y: 0, r: 90, uncharted: false },
      { id: 2, name: "rust · wasm", x: 260, y: 40, r: 60, uncharted: false },
      { id: 0, name: "Uncharted", x: 460, y: 0, r: 40, uncharted: true },
    ],
    places: [
      {
        tag: "java", region: 1, x: 0, y: 0, articleCount: 3, factoidCount: 2, kind: "shared", r: 9.8, labelSize: 12.2, minor: false,
        pins: [
          { kind: "article", title: "Virtual threads", slug: "2026/10/virtual-threads", x: 0, y: -22, publishedAt: ago(DAY) },
          { kind: "factoid", title: "jvm", selector: "jvm", x: 18, y: -12, createdAt: ago(60 * DAY), updatedAt: ago(DAY) },
        ],
      },
      {
        tag: "spring", region: 1, x: 40, y: 30, articleCount: 1, factoidCount: 0, kind: "articles", r: 6.6, labelSize: 11, minor: true,
        pins: [{ kind: "article", title: "Boot 4", slug: "2026/09/boot-4", x: 40, y: 14, publishedAt: ago(30 * DAY) }],
      },
      {
        tag: "rust", region: 2, x: 260, y: 40, articleCount: 0, factoidCount: 4, kind: "factoids", r: 9.2, labelSize: 12, minor: false,
        pins: [{ kind: "factoid", title: "borrowck", selector: "borrowck", x: 260, y: 20, createdAt: ago(3 * DAY), updatedAt: ago(3 * DAY) }],
      },
      { tag: "wasm", region: 2, x: 290, y: 60, articleCount: 1, factoidCount: 0, kind: "articles", r: 6.6, labelSize: 11, minor: true, pins: [] },
      { tag: "cobol", region: 0, x: 460, y: 0, articleCount: 1, factoidCount: 0, kind: "articles", r: 6.6, labelSize: 11, minor: true, pins: [] },
    ],
    bounds: { x: -300, y: -400, width: 1400, height: 900 },
    laidOutAt: "2026-10-08T12:00:00Z",
  };
}

/** The posts and factoids What's new reads: by default one new post at java, one factoid taught
   at rust, one changed at java, and older ones. */
export async function stubCatalog({ posts, factoids }: { posts?: unknown[]; factoids?: unknown[] } = {}) {
  await stub("/posts", {
    posts: posts ?? [
      { id: "p1", title: "Virtual threads", slug: "2026/10/virtual-threads", publishedAt: ago(DAY), tags: ["java", "Loom"] },
      { id: "p2", title: "Boot 4", slug: "2026/09/boot-4", publishedAt: ago(30 * DAY), tags: ["spring"] },
    ],
    page: 0, totalPages: 1, totalCount: 2,
  }, { query: { page: 0, size: 100 } });
  await stub("/factoids", {
    factoids: factoids ?? [
      { selector: "borrowck", createdAt: ago(3 * DAY), updatedAt: ago(3 * DAY), tags: ["rust"], locked: false, accessCount: 0 },
      { selector: "jvm", createdAt: ago(60 * DAY), updatedAt: ago(DAY), tags: ["java"], locked: false, accessCount: 0 },
      { selector: "cobol-is-old", createdAt: ago(90 * DAY), updatedAt: ago(90 * DAY), tags: ["cobol"], locked: false, accessCount: 0 },
    ],
    page: 0, totalPages: 1, totalCount: 3,
  }, { query: { page: 0, size: 100 } });
}

export async function stubAtlas(body: unknown = atlas()) {
  await stub("/atlas", body);
  await stubCatalog();
}
