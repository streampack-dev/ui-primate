/* Where readers' sessions are kept, and clearing out old ones.

   In Postgres, at BCN_DB_URL (postgres://user:password@host:port/database), in a database of
   ui-primate's own: Primate's Postgres driver keeps tables in the public schema, so sharing
   streampack's database would put them among streampack's, and is refused. Production should
   use its own user and password too, as ui-pudl does, so one app's credentials don't open the
   other's data. Without BCN_DB_URL, sessions are kept in memory, and a restart signs everyone out.

   Sessions aren't expired by Primate, so sweep() lets a visitor's go a day after it began (it only
   ever held a form token) and a reader's thirty days after they signed in, as the cookie does. */
import p from "pema";
import store from "primate/store";

type Env = Record<string, string | undefined>;
export type DatabaseConfig = { host: string; port: number; database: string; username?: string; password?: string };

const DAY = 24 * 60 * 60 * 1000;
export const READER_DAYS = 30;
const VISITOR_DAYS = 1;

/** The database name in a JDBC or postgres:// URL, as streampack's DB_URL gives it. */
function databaseName(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url.replace(/^jdbc:/, "")).pathname.replace(/^\//, "") || null;
  } catch {
    return null;
  }
}

export function sessionDatabase(env: Env): { config: DatabaseConfig | null; fatal: string[]; warnings: string[] } {
  const production = env.NODE_ENV === "production";
  const url = env.BCN_DB_URL;
  if (!url) {
    return { config: null, fatal: [], warnings: production ? ["BCN_DB_URL isn't set: sessions are kept in memory, and a restart signs everyone out."] : [] };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { config: null, fatal: ["BCN_DB_URL isn't a postgres://user:password@host:port/database URL."], warnings: [] };
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!database) return { config: null, fatal: ["BCN_DB_URL names no database: give ui-primate a database of its own."], warnings: [] };

  const fatal: string[] = [];
  const warnings: string[] = [];
  if (database === databaseName(env.DB_URL)) {
    fatal.push(`BCN_DB_URL names streampack's database (${database}): ui-primate's tables would sit among streampack's. Give it a database of its own.`);
  }
  const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
  if (production && password && password === env.DB_PASSWORD) {
    warnings.push("BCN_DB_URL has streampack's password: give ui-primate a user and password of its own.");
  }
  return {
    config: {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 5432,
      database,
      ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
      ...(password ? { password } : {}),
    },
    fatal,
    warnings,
  };
}

/* What a session holds. Primate keeps only what a session store's schema names (its default store
   names nothing of ours, so it would quietly drop it all), so every field is here: when it began,
   the token the reader's forms carry, the address a code went to while they sign in, who they are
   once they have, and their API tokens, sealed (vault.ts). */
export function sessionStore(db: any) {
  return store({
    table: "session",
    db,
    schema: {
      id: store.key.primary(p.uuid),
      session_id: p.uuid,
      created: p.date,
      csrf: p.string,
      pendingEmail: p.string.optional(),
      userId: p.string.optional(),
      username: p.string.optional(),
      displayName: p.string.optional(),
      role: p.string.optional(),
      access: p.string.optional(),
      refresh: p.string.optional(),
    },
  });
}

/** Lets go of sessions past their time (above). */
export async function sweep(sessions: ReturnType<typeof sessionStore>, now = new Date()) {
  await sessions.delete({ where: { created: { $before: new Date(now.getTime() - READER_DAYS * DAY) } } });
  const visitors = (await sessions.find({ where: { created: { $before: new Date(now.getTime() - VISITOR_DAYS * DAY) } } }))
    .filter((s: { userId?: string | null }) => !s.userId);
  for (const s of visitors) await sessions.delete(s.id);
}
