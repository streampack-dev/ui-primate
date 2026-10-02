/* Once, before the page and browser tests: the stub API, a Postgres of their own (Testcontainers,
   as ui-pudl's tests have), and the app as it ships (a production build, served) pointed at both.
   The app runs in New York's time zone, so a date shown in the server's local time rather than
   the site's shows up whatever zone the tests run in. */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import net from "node:net";
import type { TestProject } from "vitest/node";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { startStubApi } from "./stub-api.ts";

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

/** The built app, served on a port of its own with [env]; stop() ends it. */
export async function startApp(env: Record<string, string>): Promise<{ url: string; stop: () => void }> {
  const port = await freePort();
  // On the Node the image ships with, when `just test` says which (UI_TEST_NODE); else this one.
  const app = spawn(process.env.UI_TEST_NODE || process.execPath, ["build/server.js"], {
    env: { ...process.env, PORT: String(port), TZ: "America/New_York", UI_DEV: "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  app.stdout.on("data", (d) => (log += d));
  app.stderr.on("data", (d) => (log += d));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(url);
      break;
    } catch {
      if (i === 99 || app.exitCode !== null) throw new Error(`The app didn't start:\n${log}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return { url, stop: () => app.kill() };
}

export default async function setup(project: TestProject) {
  const [stubApi, db] = await Promise.all([startStubApi(), new PostgreSqlContainer("postgres:18").start()]);
  // primate build can fail and still exit 0, so a build is only known good by what it leaves.
  rmSync("build", { recursive: true, force: true });
  let output = "";
  try {
    output = execFileSync("npx", ["primate", "build"], { stdio: "pipe" }).toString();
  } catch (e) {
    output = `${(e as { stderr?: Buffer }).stderr || ""}${(e as { stdout?: Buffer }).stdout || ""}`;
  }
  if (!existsSync("build/server.js")) throw new Error(`The build failed:\n${output}`);

  // The pages ask the API every time (BCN_CACHE_FRESH_SECONDS 0), since tests change its answers
  // between pages; how long answers are kept is the client's own test (unit/client.test.ts).
  const env = { BCN_API_BASE: stubApi.url, BCN_DB_URL: db.getConnectionUri(), SESSION_SECRET: "a test secret, long enough to be one", BCN_CACHE_FRESH_SECONDS: "0" };
  const app = await startApp(env);
  project.provide("stubApi", stubApi.url);
  project.provide("appUrl", app.url);
  project.provide("appEnv", env);
  return async () => {
    app.stop();
    await Promise.all([stubApi.close(), db.stop()]);
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    stubApi: string;
    appUrl: string;
    /** What the app was started with, for starting another like it. */
    appEnv: Record<string, string>;
  }
}
