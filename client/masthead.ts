/* The masthead's animation, from streampack-dev/masthead: on the front page only, with the deks
   of the stories beside the lead and below the fold for the Solari board. */
import { startMasthead } from "@streampack-dev/masthead";

const art = document.querySelector<SVGSVGElement>("svg.masthead-art");
if (art) {
  const read = (kind: string) =>
    Array.from(document.querySelectorAll(`[data-masthead-dek="${kind}"]`))
      .map((p) => p.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter(Boolean);
  startMasthead(art, {
    deks: () => {
      const more = read("more");
      return more.length ? more : read("secondary");
    },
  });
}
