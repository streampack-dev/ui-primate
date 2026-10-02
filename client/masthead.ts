/* The masthead's animation, from streampack-dev/masthead: on the front page only, with the deks
   of the stories beside the lead and below the fold for the Solari board. Its frame is the whole
   masthead, so a click anywhere on it (the art lies under the name and tagline) pokes the
   animation; the name's link passes clicks through untouched. */
import { startMasthead } from "@streampack-dev/masthead";

const art = document.querySelector<SVGSVGElement>("svg.masthead-art");
if (art) {
  const read = (kind: string) =>
    Array.from(document.querySelectorAll(`[data-masthead-dek="${kind}"]`))
      .map((p) => p.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter(Boolean);
  startMasthead(art, {
    frame: art.closest(".masthead-frame") ?? undefined,
    deks: () => {
      const more = read("more");
      return more.length ? more : read("secondary");
    },
  });
}
