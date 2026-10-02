# ui-primate: what's left

Features, in the order they're being built (as agreed 2026-10-01):

- [x] Post pages
- [x] Site feed
- [x] Sign-in by emailed code, and sign-out
- [x] Post submission
- [x] Comment submission: post, reply, edit, admin removal
- [x] Logs
- [x] RSS reader
- [x] Tags, and the pages for each tag
- [x] Category pages
- [x] Search
- [x] Factoids
- [x] Karma
- [x] Profile
- [x] Editing posts
- [x] Admin pages
- [x] OG images (`/og/posts/…png`, `/og/site.png`) and the OG preview
- [x] The sitemap (`/sitemap.xml`), the API's, as ui-nextjs serves it

Before it's deployed:

- [x] Favicon
- [x] A proper icon for the theme toggle
- [x] `just image` and the Dockerfile check the build produced `build/server.js`:
      `primate build` can fail and still exit 0 (primate-bugs/01)
- [x] Sessions in a database of ui-primate's own (BCN_DB_URL)

Smaller things noticed along the way:

- [ ] Google Analytics, as ui-nextjs and ui-pudl have it (deploy#3): a GA_MEASUREMENT_ID read at run
      time. The deploy service doesn't pass one yet, since there's nothing to read it.
- [ ] Node 24 and 26 crash the server under load (primate-bugs/09); the image stays on Node 22. Locally
      (Node 26), `just dev` and `just run` can fall over when a browser abandons a request. Retry
      newer Node when it's fixed.
- [ ] No compression: Primate sends pages as they are (22 KB for the front page). The proxy in front
      should gzip or brotli them.
- [x] Steps asked first (removing comments, approving and deleting posts, the admin pages' user and
      category steps) are asked in a dialog when there's script, on a page of their own without it
- [ ] The editor's preview is close to the API's rendering, not exact: markdown-it, where the API has
      flexmark, so asides and admonitions aren't drawn. Not urgent (2026-10-02); the saved post is
      always rendered by the API. ui-pudl's preview is exact because it uses flexmark itself.
- [ ] Sessions end thirty days after sign-in, not after thirty idle days as ui-pudl's do

Parked:

- [ ] Sign-in through an outside provider (OIDC). Very low priority (2026-10-01): the backend
      supports it, but its callback goes to one front end, which is a problem with several.
