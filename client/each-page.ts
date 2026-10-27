/* With client-side navigation on (Marko's CSR), Primate shows a new page without loading a new
   document, so these scripts run only once. What sets up a page's parts runs here instead: now,
   and again after each navigation Primate finishes (navigate.after, Primate 0.43), by a link, a
   form, the back button or a refresh. It should skip what it has already set up, since it may be
   asked again. */
import navigate from "primate/navigate";

export function eachPage(setUp: () => void) {
  setUp();
  navigate.after(() => setUp());
}
