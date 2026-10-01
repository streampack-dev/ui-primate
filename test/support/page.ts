/* Fetching a page from the app as a reader would, and reading its HTML. */
import { parse, type HTMLElement } from "node-html-parser";
import { inject } from "vitest";

export async function page(path: string): Promise<{ status: number; doc: HTMLElement; html: string }> {
  const response = await fetch(`${inject("appUrl")}${path}`);
  const html = await response.text();
  return { status: response.status, doc: parse(html), html };
}

/** The text of an element, whitespace collapsed. */
export function text(el: HTMLElement | null | undefined): string {
  return (el?.textContent || "").replace(/\s+/g, " ").trim();
}
