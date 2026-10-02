import memorydb from "primate/memorydb";
import { describe, expect, it } from "vitest";
import { sessionDatabase, sessionStore, sweep } from "../../src/auth/sessions.ts";

const STREAMPACK = { DB_URL: "jdbc:postgresql://db:5432/nevet", DB_USERNAME: "nevet", DB_PASSWORD: "s3cret" };

describe("where sessions are kept", () => {
  it("is BCN_DB_URL's database, the URL's parts decoded", () => {
    const { config } = sessionDatabase({ BCN_DB_URL: "postgres://ui_primate:p%40ss@db.example:5433/ui_primate" });
    expect(config).toEqual({ host: "db.example", port: 5433, database: "ui_primate", username: "ui_primate", password: "p@ss" });
  });

  it("is memory without BCN_DB_URL: fine in development, a warning in production", () => {
    expect(sessionDatabase({})).toEqual({ config: null, fatal: [], warnings: [] });
    const production = sessionDatabase({ NODE_ENV: "production" });
    expect(production.config).toBeNull();
    expect(production.warnings.join(" ")).toContain("memory");
  });

  it("is refused when it's streampack's own database, since the tables would sit among streampack's", () => {
    const shared = sessionDatabase({ ...STREAMPACK, BCN_DB_URL: "postgres://nevet:s3cret@db:5432/nevet" });
    expect(shared.fatal.join(" ")).toContain("nevet");
  });

  it("is refused without a database name", () => {
    expect(sessionDatabase({ BCN_DB_URL: "postgres://db:5432" }).fatal.join(" ")).toContain("database");
  });

  it("warns production that shares streampack's password", () => {
    const { fatal, warnings } = sessionDatabase({ ...STREAMPACK, NODE_ENV: "production", BCN_DB_URL: "postgres://ui_primate:s3cret@db:5432/ui_primate" });
    expect(fatal).toEqual([]);
    expect(warnings.join(" ")).toContain("password");
  });

  it("is fine in production with its own database, user and password", () => {
    expect(sessionDatabase({ ...STREAMPACK, NODE_ENV: "production", BCN_DB_URL: "postgres://ui_primate:other@db:5432/ui_primate" }))
      .toMatchObject({ fatal: [], warnings: [] });
  });
});

describe("clearing out old sessions", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("lets an unsigned-in visitor's go after a day, and a reader's after thirty", async () => {
    const store = sessionStore(memorydb());
    await store.create();
    const now = new Date("2026-10-31T12:00:00Z");
    const ago = (days: number) => new Date(now.getTime() - days * DAY);
    const row = (name: string, created: Date, userId?: string) =>
      store.insert({ session_id: crypto.randomUUID(), csrf: name, created, ...(userId ? { userId } : {}) });
    await row("visitor, an hour", new Date(now.getTime() - 3_600_000));
    await row("visitor, two days", ago(2));
    await row("reader, two days", ago(2), "u1");
    await row("reader, 29 days", ago(29), "u2");
    await row("reader, 31 days", ago(31), "u3");

    await sweep(store, now);
    const kept = (await store.find({ where: {} })).map((s: { csrf: string }) => s.csrf).sort();
    expect(kept).toEqual(["reader, 29 days", "reader, two days", "visitor, an hour"]);
  });
});
