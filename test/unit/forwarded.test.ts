import { describe, expect, it } from "vitest";
import { onThisHost } from "../../src/lib/forwarded.ts";

const DOC = `<urlset><loc>https://bytecode.news</loc><loc>https://bytecode.news/posts/x</loc><loc>https://bytecode.newsletter.example/y</loc></urlset>`;

describe("moving the API's links to the reader's host", () => {
  it("moves the address the API builds its links on, whatever this site calls itself", () => {
    // Deployed as primate.bytecode.news with SITE_URL set to match: the API still links to
    // bytecode.news, and that's what moves.
    expect(onThisHost(DOC, "https://bytecode.news", "https://primate.bytecode.news")).toBe(
      `<urlset><loc>https://primate.bytecode.news</loc><loc>https://primate.bytecode.news/posts/x</loc><loc>https://bytecode.newsletter.example/y</loc></urlset>`,
    );
  });

  it("leaves the document as it is on the API's own host", () => {
    expect(onThisHost(DOC, "https://bytecode.news", "https://bytecode.news")).toBe(DOC);
  });

  it("matches the address whatever its case, and with a trailing slash given", () => {
    expect(onThisHost(`<a href="HTTPS://Bytecode.News/z">`, "https://bytecode.news/", "https://www.bytecode.news")).toBe(`<a href="https://www.bytecode.news/z">`);
  });
});
