import { beforeEach, describe, expect, inject, it } from "vitest";
import { startApp } from "../support/app.ts";
import { list, post, resetStubs, stub, stubSite } from "../support/stub.ts";

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts", list([post()]), { query: { page: 0, size: 9 } });
  await stub("/posts/popular", list([]), { query: { page: 0, size: 3 } });
});

describe("an address nothing answers", () => {
  it("is the site's own Not Found page, framed like the rest, not Primate's bare one", async () => {
    const response = await fetch(`${inject("appUrl")}/no/such/page`);
    const html = await response.text();
    expect(response.status).toBe(404);
    expect(html).toContain("<title>Not Found | ByteCode.News</title>");
    expect(html).toContain("<footer");
  });
});

describe("Google Analytics on the pages", () => {
  it("is on every page, read at run time, when the app is started with a measurement id", async () => {
    const app = await startApp({ ...inject("appEnv"), GA_MEASUREMENT_ID: "G-ABC123XYZ" });
    try {
      for (const path of ["/", "/login", "/no-such-page"]) {
        const html = await (await fetch(`${app.url}${path}`)).text();
        expect(html, path).toContain("https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ");
      }
    } finally {
      app.stop();
    }
  });

  it("isn't, when it's started without one", async () => {
    const html = await (await fetch(`${inject("appUrl")}/`)).text();
    expect(html).not.toContain("googletagmanager");
  });
});
