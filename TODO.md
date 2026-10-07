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

Since (2026-10-03):

- [x] RSS reader: a Refresh that asks the API again past this app's kept answers, drawn in place, and
      how new the newest item is (#5)
- [x] Logs: search a channel for text, a nick, or both (/logs/search, #4); each line found links to
      its day at that line. Anchors are a line's second, so of several lines in one second, the
      first is the one landed on
- [x] Logs: channels listed alphabetically; an action or a channel event (`* ada waves`,
      `* pebble joined #java`) shown as its own text, without its sender in front, ready for
      streampack#124 attributing events to the nick
- [x] Logs at readable addresses (#16, streampack#147): /logs/irc/libera/java, its days
      (/logs/irc/libera/java/2026-10-06) and its search (/logs/irc/libera/java/search?q=), for the
      Libera logging notice; the query forms answer 301 there, and another spelling of a channel
      (%23java) is sent to the API's address for it (2026-10-07)
- [x] Factoids: signed-in readers teach, edit and forget them, admins lock and unlock them, as
      ui-pudl has it (ui-pudl #170). Only what changed is sent; an emptied field forgets that
      attribute. `see` and `maven` aren't offered: the API sets them but its detail doesn't show them
- [x] Moderation (streampack#150): /admin/moderation lists the abuse reports by status, the open
      ones counted in the admin nav; a report's page shows its lines with their context (flagged,
      cited and hidden marked), the AI's verdict, its history, and ways to the public log's days and
      the sender's lines in that channel (the log search: the API has no cross-channel search).
      Checked lines are hidden, unhidden or purged (asked first, on a page of its own, saying it
      can't be undone; only that page's form sends confirm: true), and an open report dismissed.
      /admin/moderation/logs is a day with its hidden lines, to hide or unhide them, and the public
      log's day links to it for admins. Nothing is hidden by itself, and the bot bans no one
      (2026-10-07)

Before it's deployed:

- [x] Favicon
- [x] A proper icon for the theme toggle
- [x] `just image` and the Dockerfile check the build produced `build/server.js`:
      `primate build` can fail and still exit 0 (primate-bugs/01)
- [x] Sessions in a database of ui-primate's own (BCN_DB_URL)

Smaller things noticed along the way:

- [x] Google Analytics, as ui-nextjs and ui-pudl have it (deploy#3): GA_MEASUREMENT_ID, read at run
      time
- [x] Node 24 and 26 crashed the server under load (primate-bugs/09). Fixed by primate 0.42: 0.42.1
      held on Node 24 and 26 through ten rounds where 0.41.0 died in the first; the image is on
      Node 26, as development is, and the toHex shim for primate-bugs/10 is gone (2026-10-07)
- [x] No compression: Primate sends pages as they are (22 KB for the front page). The proxy in front
      gzips them (deploy/bytecode.news.conf, 2026-10-02)
- [x] Browser caching: bundles kept for good (their names carry their hash), icons a day
      (src/lib/asset-cache.ts)
- [x] API answers used as they are for ui-pudl's intervals (15 s to 10 min) before asking again, and
      asked for at once after this app changes something: front page and logs were ~100 ms behind
      ui-pudl (2026-10-02)
- [x] Fonts self-hosted (tools/fonts.mjs, `just fonts`), not from Google Fonts: its stylesheet was
      render-blocking from another server and the last thing first paint waited on, and its fonts
      couldn't be preloaded. Latin faces every page uses are bundled and preloaded (2026-10-02)
- [x] Decided: no prerendering (speculation rules): a prerendered post runs client/read.ts and
      would count a read nobody made, skewing Popular Reads (2026-10-02)
- [x] Steps asked first (removing comments, approving and deleting posts, the admin pages' user and
      category steps) are asked in a dialog when there's script, on a page of their own without it
- [ ] The editor's preview is close to the API's rendering, not exact: markdown-it, where the API has
      flexmark, so asides and admonitions aren't drawn. Not urgent (2026-10-02); the saved post is
      always rendered by the API. ui-pudl's preview is exact because it uses flexmark itself.
- [x] Client-side navigation (CSR, on since 1.0.3): client/ scripts set up each page shown, not just
      the first, so reads (and temperature) are counted, code is highlighted, the masthead starts
      and the theme toggle works; forms are submitted by the browser (2026-10-02)
- [x] With CSR, the head (title, canonical, description, OG, robots) follows client-side navigation:
      routes put `meta` in the view's props, #lib/view.ts draws it into %meta% for the server's
      render, and each view's <page-meta> applies it in the browser, as terrablue suggested
      (Primate's website's Header.marko) (2026-10-02)
- [x] Primate 0.42 (2026-10-03): its client submits forms properly (GET forms, answers that
      aren't 2xx, a redirect's #fragment), so client/forms.ts is gone and forms are drawn in place
      like links (test/browser/navigation.test.ts). The post form's helper buttons are named
      `helper`, not `action`: a control named `action` hides the form's own action from script, and
      Primate's client posted to `/[object HTMLButtonElement]`
- [ ] @primate/marko 0.13 has a `<Head>` tag; <page-meta> and the %meta% placeholder
      (#lib/view.ts) still work, and could move to it
- [ ] Sessions end thirty days after sign-in, not after thirty idle days as ui-pudl's do

Parked:

- [ ] Sign-in through an outside provider (OIDC). Very low priority (2026-10-01): the backend
      supports it, but its callback goes to one front end, which is a problem with several.
