/* With client-side navigation on (Marko's CSR), Primate shows a new page by replacing the body's
   children, without loading a new document, so these scripts run only once. What sets up a page's
   parts runs here instead: now, and again whenever the body is replaced, by a link, a form or the
   back button. It should skip what it has already set up, since it may be asked again. */
export function eachPage(setUp: () => void) {
  setUp();
  new MutationObserver(setUp).observe(document.body, { childList: true });
}
