# ui-primate: what's left

Features, in the order they're being built (as agreed 2026-10-01):

- [x] Post pages
- [x] Site feed
- [x] Sign-in by emailed code, and sign-out
- [x] Post submission
- [x] Comment submission: post, reply, edit, admin removal
- [ ] Logs
- [ ] RSS reader
- [ ] Tags, and the pages for each tag
- [ ] Category pages
- [ ] Search
- [ ] Factoids
- [ ] Karma
- [ ] Profile
- [ ] Editing posts
- [ ] Admin pages
- [ ] OG images (`/og/posts/…png`, already linked from post pages) and the OG preview
- [ ] Sign-in through an outside provider (OIDC, `/auth/callback`)

Before it's deployed:

- [ ] Favicon
- [ ] A proper icon for the theme toggle (◐ for now)
- [ ] `just image` and the Dockerfile check the build produced `build/server.js`:
      `primate build` can fail and still exit 0 (primate-bugs/01)
- [x] Sessions in a database of ui-primate's own (BCN_DB_URL)

Smaller things noticed along the way:

- [ ] Comment removal asks on a page of its own; a dialog, when script is there, would save the trip
      (ui-pudl does both)
- [ ] Sessions end thirty days after sign-in, not after thirty idle days as ui-pudl's do
