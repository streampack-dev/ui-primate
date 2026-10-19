# ui-primate

A front end for the ByteCode News API, built with [Primate](https://primate.run) and Marko. It has
ui-nextjs's look and follows ui-pudl's methods: server-rendered pages that work without
JavaScript, an API client pinned to an API version with ETag caching, server-side sessions with
sealed tokens, fingerprinted assets, and a Docker image pushed to Nexus.

## Running it

```sh
npm ci
cp .env.default .env   # then fill in what's empty
just create-db         # ui-primate's own database, on streampack's local Postgres
just dev               # live reload; pages render in the browser here
just run               # the production build: server-rendered, as it ships
```

`just test` runs the tests against a production build, a stub API and a Postgres of their own
(Testcontainers), so Docker must be running. `just coverage` runs them and reports line and
branch coverage, with the report in `coverage/`; the target is 70% of lines. The served app's
coverage is mapped back to the sources through the build's source map. The browser scripts in
`client/` run in the browser, and aren't counted. `just` lists the rest.

## Releasing

A full release, from an up-to-date `main`:

```sh
just release patch && git add package*.json && git commit -m "Updating version" && git push
```

`just full-release` does exactly that, each step only if the one before it worked; give it `minor`
or `major` for those. `just release` bumps the version in `package.json` and `package-lock.json`
and builds and pushes the image; it refuses to run from any branch but `main`, or from a `main`
behind `origin/main`, and changes nothing when it does.

## Configuration

| Variable | Default |
|---|---|
| `BCN_API_BASE` | `https://api.bytecode.news` |
| `BCN_ACCEPT_VERSION` | `2026-03-10`, the API version this build targets |
| `BCN_DB_URL` | none: sessions kept in memory, so a restart signs everyone out. `postgres://user:password@host:port/database` |
| `SESSION_SECRET` | none: a random one each start. Seals API tokens in sessions; changing it signs everyone out |
| `SESSION_COOKIE_SECURE` | `false`; `true` behind a proxy that ends TLS |
| `SITE_URL` | `https://bytecode.news`, the address for canonical links and link previews |
| `BCN_API_SITE_URL` | `https://bytecode.news`: the address the API builds its feed and sitemap links on (streampack's `BLOG_BASE_URL`). The feeds and sitemap move it to whatever host the reader asked. Not `SITE_URL`: on primate.bytecode.news that may name this site, but the API still links to bytecode.news. |
| `GA_MEASUREMENT_ID` | none: no analytics, and nothing of Google's on the page. A Google Analytics measurement id (`G-…`) puts gtag on every page, as ui-nextjs and ui-pudl do; anything not shaped like an id is ignored, with a warning. |
| `PORT` | `3000` |

## Recordings

A post's recording (up to 100 MB) is uploaded through the editor to `POST /edit/{id}/audio`, and
passed on to the API as it arrives. A proxy in front has to let that through: a body limit over
100 MB, the body passed on unbuffered, and a timeout of 10 minutes, as the app waits for the API.
The rest of the site needs none of that, and the API's own proxy needs the same limit. The app
gives a request half an hour to arrive whole (Node's own limit is five minutes), so an upload on
a slow connection isn't cut off. The
recordings themselves are played and downloaded from the API's own address, not this app.

### nginx

nginx's default body limit is 1 MB, and a larger upload gets nginx's own 413:

```nginx
server {
    server_name primate.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # A post's recording: up to the API's 100 MB, passed on as it arrives.
    location ~ ^/edit/[^/]+/audio$ {
        client_max_body_size 101m;
        proxy_request_buffering off;
        proxy_read_timeout 10m;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Caddy

Caddy sets no body limit, passes a body on as it arrives and has no read timeout by default, so a
recording goes through as it is. A `request_body` limit on its path holds it to 100 MB at the proxy
too:

```caddyfile
primate.example.com {
    # Optional: a limit just over the API's 100 MB.
    @recording path_regexp ^/edit/[^/]+/audio$
    request_body @recording {
        max_size 101MB
    }

    reverse_proxy 127.0.0.1:3000
}
```

### Apache httpd

With `mod_proxy` and `mod_proxy_http`, the body is passed on as it arrives. The upload needs a
timeout of 10 minutes, where the default is a minute. The default `LimitRequestBody` (1 GB since
2.4.54) is already over 100 MB, but setting it holds the path to the API's limit. The
`ProxyPassMatch` must come before the catch-all `/`, since Apache takes the first that matches:

```apache
<VirtualHost *:443>
    ServerName primate.example.com
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"

    # A post's recording: up to the API's 100 MB, with time for the API to take it.
    ProxyPassMatch "^/edit/([^/]+)/audio$" "http://127.0.0.1:3000/edit/$1/audio" timeout=600
    <LocationMatch "^/edit/[^/]+/audio$">
        LimitRequestBody 105906176
    </LocationMatch>

    ProxyPass        / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>
```

## Sessions

Readers' sessions are kept in Postgres, in a database of ui-primate's own. Primate's Postgres driver
puts its tables in the `public` schema, so sharing streampack's database would put them among
streampack's tables. The app refuses to start if `BCN_DB_URL` names streampack's database (the
one in `DB_URL`). Primate creates the `session` table when the app starts.

Development keeps the database on streampack's local Postgres (`just create-db`). In production,
give ui-primate its own database, user and password, so one app's credentials don't open
another's data. On the same Postgres server:

```sql
CREATE USER ui_primate WITH PASSWORD '<a new password>';
CREATE DATABASE ui_primate OWNER ui_primate;
```

then set `BCN_DB_URL=postgres://ui_primate:<password>@<host>:5432/ui_primate`, a `SESSION_SECRET`
(`openssl rand -base64 48`), and `NODE_ENV=production`. In production, the app warns if sessions
are in memory or if the password is streampack's.

A session cookie lasts thirty days. Old sessions are cleared out hourly: a visitor's a day after
it began (it only held a form token), and a reader's thirty days after they signed in.

## Diagrams

A post's Mermaid diagrams arrive drawn, as SVG in its `renderedHtml` (streampack#252). `client/master.css` colours them from the site's tokens, so light and dark both follow. They're set in IBM Plex Sans and Mono, the faces the API measured every label in, as IBM ships them: `static/diagram-fonts/`, declared in `templates/app.html` and fetched only by a page with a diagram. Refresh them with `just diagram-fonts`, at the versions streampack bundles. Never set `--pele-font`: a label in another font won't fit its box.

The editor's preview is rendered here, not by the API, so its diagrams are drawn in the browser: `client/mermaid.ts` runs [Pele](https://pele.run) (MIT) with the API's options and markup, after the Plex faces load, so the preview's boxes match the published post's. Pele is pinned in `package.json` to exactly the version streampack bundles; move them together. It's loaded only when a preview has a diagram.

## Comments on a passage

A reader who selects text in a post gets a "Comment on this passage" button, which quotes the selection in the new-comment form; the quote goes to the API as the comment's anchor (streampack#256). Comments that quote a passage show as callouts beside the post, level with their passage, when the space to the right of the centred post has room (16rem: a window about 1280px wide or more); otherwise as a marker after the passage's paragraph. The post never moves or rewraps for them. A comment whose passage an edit removed says so, from the API's `anchorFound`.

`client/annotate.ts` does the site's part. The text matching and the callouts' placing come from `@streampack-dev/clientjs` (its `anchors` module), from the streampack-dev Nexus as the masthead is; it must match the API's `html_text()`, so move it when streampack changes how it reads a post's text. Without script, the form takes no quote and the thread shows each quote as the API rendered it.

## License

MIT; see [LICENSE](LICENSE). IBM Plex is under the SIL Open Font License (`static/diagram-fonts/IBM-Plex-OFL.txt`).
