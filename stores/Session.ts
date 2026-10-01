import p from "pema";
import memorydb from "primate/memorydb";
import store from "primate/store";

/* What a reader's session holds. Primate keeps only what a session store's schema names (its
   default store names nothing of ours, so it would quietly drop it all), so every field is here:
   the token their forms carry, the address a code went to while they sign in, who they are once
   they have, and their API tokens, sealed (src/auth/vault.ts).

   In memory for now: a restart signs everyone out. A database (as ui-pudl keeps its sessions)
   takes this same schema, with only `db` changed. */
export default store({
  table: "session",
  db: memorydb(),
  schema: {
    id: store.key.primary(p.uuid),
    session_id: p.uuid,
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
