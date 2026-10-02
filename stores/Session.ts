import postgresql from "@primate/postgresql";
import memorydb from "primate/memorydb";
import { sessionDatabase, sessionStore } from "#auth/sessions.ts";

/* Readers' sessions, kept in Postgres at BCN_DB_URL, or in memory without it (src/auth/sessions.ts
   says why it must be a database of ui-primate's own). Primate creates the table when it starts. */
const { config, fatal, warnings } = sessionDatabase(process.env);
if (fatal.length) throw new Error(fatal.join(" "));
for (const warning of warnings) console.warn(warning);

export default sessionStore(config ? postgresql(config) : memorydb());
