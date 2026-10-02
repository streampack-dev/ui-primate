/* A reader's browser, as far as the server can tell: it keeps the cookies it's given and sends them
   back, and sees redirects rather than following them, so a test can check where it's sent. */
import { parse, type HTMLElement } from "node-html-parser";
import { inject } from "vitest";

export class Visitor {
  cookies = new Map<string, string>();

  /** A browser on the app at [base], the tests' app by default. */
  constructor(private base: string = inject("appUrl")) {}

  private keep(response: Response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const [name, ...value] = pair.split("=");
      const expired = attrs.some((a) => /max-age=0/i.test(a.trim()) || /expires=thu, 01 jan 1970/i.test(a.trim()));
      if (expired || value.join("=") === "") this.cookies.delete(name.trim());
      else this.cookies.set(name.trim(), value.join("="));
    }
  }

  private headers(extra: Record<string, string> = {}) {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    return { ...(cookie ? { Cookie: cookie } : {}), ...extra };
  }

  async get(path: string): Promise<{ status: number; location: string | null; doc: HTMLElement; html: string }> {
    const response = await fetch(`${this.base}${path}`, { headers: this.headers(), redirect: "manual" });
    this.keep(response);
    const html = await response.text();
    return { status: response.status, location: response.headers.get("location"), doc: parse(html), html };
  }

  /** Posts [fields] as a form would, with the page's anti-forgery token unless [csrf] is false. */
  async post(path: string, fields: Record<string, string> = {}, { csrf = true } = {}) {
    const form = new URLSearchParams(fields);
    if (csrf && !form.has("csrf")) form.set("csrf", await this.csrf());
    const response = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/x-www-form-urlencoded" }),
      body: form.toString(),
      redirect: "manual",
    });
    this.keep(response);
    const html = await response.text();
    return { status: response.status, location: response.headers.get("location"), doc: parse(html), html };
  }

  /** The anti-forgery token the site's forms carry for this reader. */
  async csrf(): Promise<string> {
    const { doc } = await this.get("/login");
    return doc.querySelector("input[name=csrf]")?.getAttribute("value") || "";
  }
}
