/* What sign-in's forms share: where a reader may be sent back to, and the API's refusals. */

/** [to], if it's an address on this site (a path, not "//elsewhere"); else the front page. */
export function safeReturn(to: unknown): string {
  return typeof to === "string" && to.startsWith("/") && !to.startsWith("//") && !to.startsWith("/\\") ? to : "/";
}

/** What the API said went wrong, in its own words, or [fallback]. */
export async function refusal(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return (typeof body?.detail === "string" && body.detail.trim()) || fallback;
  } catch {
    return fallback;
  }
}

/** The API's rotated refresh token, from the Set-Cookie it answers with. */
export function refreshCookie(response: Response): string | null {
  for (const line of response.headers.getSetCookie()) {
    const match = /^refresh_token=([^;]*)/.exec(line);
    if (match && match[1]) return match[1];
  }
  return null;
}
