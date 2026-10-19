/* The Atlas's map, moved about (ui-pudl#184). The server draws the whole map as SVG, each place a
   link to its tag's page and each pin to its post or factoid; without this script it's a picture
   with links in it. The moving about is clientjs's atlas module (streampack-dev/clientjs, #80), the
   same in ui-pudl: zoom (the wheel, a pinch, the + and − buttons, "Whole map"), pan (a drag never
   follows its link), find without a reload, tabbing to a place bringing it into view, region names
   that never overlap, pins, What's new's places framed in place, and the address saying which
   place is framed.

   This is the site's part: starting on each page shown, again when a client-side navigation keeps
   the same map with a new view, and placing the names again for a new size. ui-pudl puts a place's
   window beside it; here a place's link is simply followed. */
import { atlas } from "@streampack-dev/clientjs/atlas";
import { eachPage } from "./each-page.ts";

const map = atlas();

eachPage(() => map.start());
// A client-side navigation to the Atlas from the Atlas (a name the map hasn't, say) may keep the
// same SVG with a new view.
window.addEventListener("primate:navigation-end", () => map.start(true));
window.addEventListener("resize", () => map.resize());
