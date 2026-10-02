import { describe, expect, it } from "vitest";
import { preview } from "../../src/lib/preview.ts";

describe("the editor's preview", () => {
  it("renders Markdown as the API does: emphasis, code, links, tables, strikethrough", () => {
    const html = preview("**bold** and `code` and [a link](https://openjdk.org)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n~~gone~~");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('<a href="https://openjdk.org">a link</a>');
    expect(html).toContain("<table>");
    expect(html).toMatch(/<(del|s)>gone<\/(del|s)>/);
  });

  it("shows raw HTML as typed, never as markup", () => {
    const html = preview('<script>alert(1)</script> <img src=x onerror="alert(2)">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps only http, https and mailto links", () => {
    const html = preview("[bad](javascript:alert(1)) [ok](mailto:a@b.c) [data](data:text/html,x)");
    // Refused links are left as the text they were written as.
    expect(html).not.toMatch(/href="(javascript|data):/);
    expect(html).toContain('href="mailto:a@b.c"');
  });

  it("links web addresses written bare", () => {
    expect(preview("see https://openjdk.org/jeps/444")).toContain('<a href="https://openjdk.org/jeps/444">');
  });

  it("draws task lists and footnotes", () => {
    const html = preview("- [x] done\n- [ ] not yet\n\nA claim.[^1]\n\n[^1]: The source.");
    const box = /<input[^>]*>/.exec(html)?.[0] ?? "";
    expect(box).toContain('type="checkbox"');
    expect(box).toContain("checked");
    expect(box).toContain("disabled");
    expect(html).toContain("The source.");
  });

  it("links [[factoids]] to their pages", () => {
    expect(preview("See [[spring]].")).toContain('<a href="/factoids/spring">spring</a>');
  });

  it("is empty for nothing written", () => {
    expect(preview("   ")).toBe("");
  });
});
