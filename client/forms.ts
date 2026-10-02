/* Forms are submitted by the browser, as they would be without script, not by Primate's client
   runtime, which takes every submission and sends it with fetch. As of @primate/core 0.10.3 that
   loses too much: a GET form's fetch fails ("Request with GET/HEAD method cannot have body"), so
   search does nothing; an answer that isn't 2xx (a form shown again with what was wrong) is dropped,
   so a refused sign-in code or comment shows nothing; and a redirect's #fragment is lost. This
   listener, on the document, comes before Primate's, on the window, and keeps the submission from
   it. Links still navigate client-side. Remove when Primate's forms do all three. */
document.addEventListener("submit", (event) => event.stopPropagation());
