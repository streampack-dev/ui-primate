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
(Testcontainers), so Docker must be running. `just` lists the rest.

## Configuration

| Variable | Default |
|---|---|
| `BCN_API_BASE` | `https://api.bytecode.news` |
| `BCN_ACCEPT_VERSION` | `2026-03-10`, the API version this build targets |
| `BCN_DB_URL` | none: sessions kept in memory, so a restart signs everyone out. `postgres://user:password@host:port/database` |
| `SESSION_SECRET` | none: a random one each start. Seals API tokens in sessions; changing it signs everyone out |
| `SESSION_COOKIE_SECURE` | `false`; `true` behind a proxy that ends TLS |
| `SITE_URL` | `https://bytecode.news`, the address for canonical links and link previews |
| `PORT` | `3000` |

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

## License

MIT; see [LICENSE](LICENSE).
