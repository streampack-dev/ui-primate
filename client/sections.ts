/* Links to a post's sections (#89, streampack#274). The API gives each heading in a post an id that
   starts with section-, so a heading can't take the name of something else on the page, such as
   #comments. clientjs's sections module (streampack-dev/clientjs#13), the same in ui-pudl: a bare
   #going-nowhere reaches the heading #section-going-nowhere, and each heading gets a # link to its
   own address. client/annotate.ts leaves those links out of the post's text, so comment anchors
   still match the server's.

   This is the site's part: following the address once, and linking each post's headings as it's
   shown. A post reached by a link is drawn after its address changed, so it's reached again then.
   Without script, an address with the full id still works; the bare name and the links don't. */
import { follow, link, reach } from "@streampack-dev/clientjs/sections";
import { eachPage } from "./each-page.ts";

follow(window);

eachPage(() => {
  const body = document.querySelector<HTMLElement>(".post-article > [data-anchor-body]");
  if (body && link(body) > 0) reach(window);
});
