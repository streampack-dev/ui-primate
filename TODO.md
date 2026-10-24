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
- [x] The header (#94, #95) is one row at every width. From 1024px: the brand, Tags, Atlas and More
      (Factoids, RSS Reader, Karma, Logs), search (a box from 1280px, the magnifier links to /search
      below), Subscribe (RSS, Podcast), the theme, Submit as the one filled button, and the account
      (a menu under the reader's name: Profile, Admin, Sign out) or Log in. Below 1024px: the brand,
      Submit and a menu holding the rest. The menus are <details>, so they work without script;
      client/menus.ts shuts the others, and shuts on Escape and a press outside. Fixes the nav
      drawn over RSS at 768-800px signed in, and the sideways scroll at 320px (2026-10-23)
- [x] Front page (#96): a card's author, date, comments and audio each stay whole, moving to the
      next line rather than breaking; pagination comes after Popular Reads; the masthead's date and
      tagline are full strength with a halo of the page's background (2026-10-23)
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
- [x] Scheduled posts (#35, streampack#207): /admin/scheduled, in the admin nav after Pending and
      counted on the dashboard, lists the posts approved to go out later, soonest first, twenty to
      a page: each title links to its editor, with when it goes out (to the minute, on the reader's
      clock), its author, and the Audio mark (2026-10-14)
- [x] Times in the reader's zone (#35): the API keeps UTC; readers see and type their own zone's
      time. client/zone.ts keeps the browser's zone in a cookie (bcn-tz), checked on each request
      (routes/+hook.ts, src/lib/zone.ts); without it, times are UTC, saying so, and the script writes
      each `<time data-local>` in the browser's zone. Shown in it: the scheduled posts' "Goes out",
      a post's "Updated", and the moderation and tag-review stamps. The editor's publish date and
      approval's are on the reader's clock, the zone beside them and sent with them, so what's saved
      is what was seen; a time that never happens (clocks forward) moves on by the gap, one that
      happens twice is the first. Still UTC, on purpose: the OG cards' dates; the channel logs
      follow their own zone (#36, below) (2026-10-14)
- [x] Logs in the instance's log zone (#36, streampack#212): /features names it (`logs.zone`,
      STREAMPACK_LOG_ZONE) and the API splits days at its midnight, so a day reads 00:00 to 23:59.
      The day is labelled with it ("Monday, October 5, 2026 (America/New_York)"), and its lines, the
      search's hits ("Search (America/New_York)"), a report's lines and the admin day are at their
      times there, each `<time>` with the reader's own in its tooltip ("Your time: 2026-10-06
      08:30:00 GMT+5:30", client/zone.ts writing it on a first visit). Today and the last day with a
      Next are the zone's. Days' addresses are the API's; lines' anchors stay their UTC second, so
      links to lines keep working. A server that doesn't name a zone is UTC's, labelled "(UTC)"
      (2026-10-14)
- [x] An upload has half an hour to arrive, where Node's requestTimeout gives five minutes (408):
      Primate doesn't let the app set it, so #lib/request-timeout.ts (a module) raises it on the
      server each request came in on (#47, 2026-10-14). When Primate takes the setting
      (primate-bugs/16), set it in config/app.ts instead
- [x] The Atlas's props carry the API's layout, not its drawing: the view draws the map from it
      (#lib/atlas-map.ts, safe in the browser), so the props are about half what they were (245 KB
      to 123 KB for 248 places). Primate has no way to leave one view's props out of hydration
      (ui-primate#48, 2026-10-14)
- [x] The Atlas's admin relayout (POST /admin/atlas/relayout) stays in pudl, the admin home; it isn't
      offered here, by design (ui-primate#48, 2026-10-14)
- [x] Search: each result shows the passage that matched, its words marked (bold and underlined,
      not by colour alone), in place of the excerpt; the excerpt when there is none. The search
      boxes say quotes match a word exactly, and a query the API refuses (too long, too many
      quotes) is shown with its reason (#54, streampack#226, #227)

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
      routes put `meta` in the view's props, and each view's <page-meta> hands its tags to
      @primate/marko's <Head>, which draws them on the server and after each navigation (#50,
      2026-10-14; before that, #lib/view.ts drew them into %meta% and <page-meta> set them by hand)
- [x] Primate 0.42 (2026-10-03): its client submits forms properly (GET forms, answers that
      aren't 2xx, a redirect's #fragment), so client/forms.ts is gone and forms are drawn in place
      like links (test/browser/navigation.test.ts). The post form's helper buttons are named
      `helper`, not `action`: a control named `action` hides the form's own action from script, and
      Primate's client posted to `/[object HTMLButtonElement]`
- [ ] <page-meta> hands <Head> its tags as escaped HTML, not as Marko tags, because
      @primate/marko 0.13.1's server-side check misreads "<" and ">" in an attribute value
      (primate-bugs/15). When that's fixed, draw the tags in Marko and drop headTags' escaping
- [ ] Sessions end thirty days after sign-in, not after thirty idle days as ui-pudl's do
- [x] Mermaid diagrams in posts (#61): the API draws them (streampack#252); master.css colours
      them with the site's tokens, light and dark, and they're set in IBM's own IBM Plex Sans and
      Mono (static/diagram-fonts/, `just diagram-fonts`), the faces the API measured them in
- [x] Mermaid in the editor's preview (#61): client/mermaid.ts draws the preview's `mermaid`
      blocks in the browser with Pele (exactly the version streampack bundles), in the API's markup
      and options, as ui-pudl's bcn-mermaid.js does; Pele loads only when a preview has one
- [x] Comments on a passage (#65, streampack#256): a selection in a post offers "Comment on this
      passage", which quotes it in the new-comment form; anchored comments show as callouts in the
      space beside the centred post (which never moves for them), or as markers after their
      paragraph where that space is too narrow. client/annotate.ts, on clientjs's anchors module
- [x] client/mermaid.ts draws through clientjs's mermaid module (#75)
- [x] client/annotate.ts sets up clientjs's annotate module (#76)
- [x] client/zone.ts says times through clientjs's zone module (#79)
- [x] client/atlas.ts moves the map about through clientjs's atlas module (#80)
- [x] Links to a post's sections (#89, streampack#274): a bare `#going-nowhere` reaches the
      heading `#section-going-nowhere`, and each h2 to h4 has a `#` link, shown on hover or focus.
      client/sections.ts, on clientjs's sections module
- [x] robots.txt (#72) and a bounded llms.txt (#73): the sitemap named, crawlers kept out of pages
      with nothing to index, the latest 30 posts and where the rest are for language models
- [x] Author pages (#88, streampack#273): `/authors/<user id>` lists an author's published posts
      as a category's page does, headed with their name; every byline links there when the API
      gives the post's `authorId`. The profile lists the reader's own posts with each one's state
      in words: a published one links to the post, an unpublished one to the editor for an admin
- [x] Share to… on a post (#98): a menu with BCN's text (`From BCN:`, the excerpt as it is, the
      post's address) in an editable box, and X, LinkedIn and Facebook buttons that copy the box and
      open the network's own share page. client/share.ts, on clientjs's share module; without
      script it's a <details> whose buttons are links to the networks' pages

Parked:

- [ ] Sign-in through an outside provider (OIDC). Very low priority (2026-10-01): the backend
      supports it, but its callback goes to one front end, which is a problem with several.
