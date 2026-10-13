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
- [x] Logs: "Everything" / "Conversation only" on a day (ui-pudl#202, as ui-pudl#211), real links,
      `?events=none` on any log address and the API's `events=none` behind it; everything is the
      default, so no address changes meaning. Previous/next, line links, channels, the query forms'
      301s and the search (its results too) keep it; event lines (`kind` not MESSAGE; none is a
      message) are marked `log-event`, italic. The admin day keeps the lines the public filtered day
      has, and every hidden line; every line when the public day can't be read (2026-10-08)
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
- [x] Moderation's lines say why (ui-primate #19, streampack#169): each flagged line shows its
      signals in words beside its mark, as the list does, and only strong lines (an aimed insult,
      personal details, a slur or a threat) start checked; repetition, flood and untargeted swearing
      don't, nor older reports' lines. A refused step keeps the checks as they were left (2026-10-07)
- [x] The Atlas (ui-pudl#184, streampack's GET /atlas): /atlas draws the API's layout as SVG on the
      server, every place a link to its tag's page and every pin to its post or factoid, told by
      shape (disc, ring, diamond; square, triangle; a dot for new, a small ring for changed) with a
      legend, beside a list of regions and places. /atlas?at=<tag> frames a place. client/atlas.ts
      zooms, pans, finds and keeps region names from overlapping. What's new since the last visit
      (bcn-atlas-seen and bcn-atlas-since, timestamps only; a first visit counts two weeks) is
      listed and marked, so the page is private, no-cache. In the header and footer (2026-10-08)
- [x] Every Set-Cookie of an answer is sent: Primate's Node server sent only the last
      (primate-bugs/14, primate task #183), which the Atlas's two cookies found. Fixed upstream in
      @rcompat/http 0.32.4 (primate 0.42.2); ui-primate's setHeader patch is gone (2026-10-08)
- [x] The tag vocabulary's admin side (streampack#140, #139; as ui-pudl#212): /admin/tags (the
      review queue), /admin/tags/feed, /aliases, /stoplist and /history, in the admin nav as "Tags"
      with open review entries plus waiting feed tags counted. Review and feed tags filter by status
      and say "Page 2 of 3 (41 kept entries)" from the API's totals. Alias, split and a new alias are
      asked on a page of their own, previewed by the API's dry run ("This re-points 3 posts and 1
      factoid to “compilers”."); Confirm is offered only when the preview says it can be done, and a
      refusal says "Not possible: " and the API's detail. With script (client/tag-ask.ts) the preview
      follows the typing. Removing an alias is asked first (no preview: the API has no dry run for
      it). Keep, dismiss, the feed tags' map, create and ignore, and the stoplist act at once; the
      list then says what was done by a fixed code, the names and counts the API answered (2026-10-09)
- [x] The site header, signed in as an admin, was wider than a phone (390px) on every page, its
      sign-out form past the edge: a signed-in reader's account links now take their own row on a
      phone (ui-primate#25, 2026-10-09)
- [x] The feed list (#28), in the RSS reader: /rss?view=feeds swaps the items for every feed the
      site follows, as IRC's `feed list` gives it ("Title - address", the title linking to the site
      when it has one), by title, twenty to a page as the items are. A small "Feed List" link beside
      Refresh leads there, not shown on a phone; "Back to Items" (/rss) and the filter form lead
      back. For finding a feed's address to subscribe a channel; no address changed (2026-10-09)
- [x] Admins rate RSS items (#27, streampack#187/#188, as ui-pudl#214): signed in as an admin, the
      reader lists /admin/rss/items, and each item has Rates, Might and Dull buttons; one click sets
      (PUT), pressing the current one clears (DELETE). The current one shows a check, aria-pressed and
      "Rated Might by ed" beside the buttons, never colour alone. Each is a small form posting to
      /admin/rss/items/<id>/rating (form token, `back`), returning to the same page at #item-<id>;
      with script, client/rate.ts rates in place. A Rating select in the filter form gives
      ?rating=unrated|rates|might|dull. The model's guess is never shown. Anyone else's reader is
      unchanged: the public items, no buttons, ?rating ignored, and the rating posts a 404 (2026-10-09)
- [x] Post audio (#33, streampack#196/#200, as ui-pudl#225): a post with a recording has a player
      (preload none, the API's own address as given, never rewritten), its length and a download
      link; the lists (front page, rows) mark such posts with headphones and the word "Audio";
      /podcast.xml is the API's, forwarded as /feed.xml is, named in every head and linked as
      "Podcast" beside RSS. The editor's Recording section, its own multipart form, says what's
      attached (made from the post as it is now, or "An earlier draft", in words), uploads or
      replaces it, and removes it, asked first. The upload is passed on to the API as it arrives
      (src/lib/recording.ts, busboy): never held whole, the token checked before any of it is sent,
      the file sent as octet-stream for the API to type, the note and length (seconds or m:ss) in the
      query. Over 100 MB, said or found, it's refused with a message, and the rest of it read and
      dropped so the browser sees it; with script, a file that big is refused as it's chosen
      (2026-10-12)
- [ ] An upload slower than five minutes is cut off (408) by Node's requestTimeout, which Primate
      doesn't let the app set (only the idle timeout): 100 MB needs about 2.7 Mbit/s up. A Primate
      issue to draft (primate-bugs/) if it bites
- [ ] The Atlas's page carries its map twice, as SVG and as Primate's hydration props (about 250 KB
      each for 248 places, before the proxy's gzip). A view whose props aren't hydrated would halve
      it
- [ ] The Atlas's admin relayout (POST /admin/atlas/relayout) isn't offered here; pudl is the
      admin home

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
