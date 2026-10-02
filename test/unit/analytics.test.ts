import { afterEach, describe, expect, it, vi } from "vitest";
import { headTags, meta } from "../../src/lib/meta.ts";

afterEach(() => {
  delete process.env.GA_MEASUREMENT_ID;
  vi.restoreAllMocks();
});

describe("Google Analytics, as ui-nextjs and ui-pudl load it", () => {
  it("is on the page when a measurement id is set: gtag loaded, and configured with the id", () => {
    process.env.GA_MEASUREMENT_ID = "G-ABC123XYZ";
    const head = headTags(meta({ title: "Midden" }));

    expect(head).toContain('<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ"></script>');
    expect(head).toContain("gtag('config', 'G-ABC123XYZ');");
    expect(head).toContain("window.dataLayer = window.dataLayer || [];");
  });

  it("isn't there at all without one: nothing of Google's", () => {
    expect(headTags(meta({ title: "Midden" }))).not.toMatch(/googletagmanager|gtag|dataLayer/);
  });

  it("is off, saying why, for something that isn't a measurement id, since the id goes in a script", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.GA_MEASUREMENT_ID = "G-1'); alert(1); ('";
    expect(headTags(meta({ title: "Midden" }))).not.toMatch(/googletagmanager|gtag/);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("GA_MEASUREMENT_ID"));
  });

  it("takes an id with stray spaces around it", () => {
    process.env.GA_MEASUREMENT_ID = "  G-ABC123XYZ \n";
    expect(headTags(meta({}))).toContain("gtag('config', 'G-ABC123XYZ');");
  });
});
