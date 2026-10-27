/* Once, before the page and browser tests: the stub API, a Postgres of their own (Testcontainers,
   as ui-pudl's tests have), and the app as it ships (a production build, served) pointed at both.
   The app runs in New York's time zone, so a date shown in the server's local time rather than
   the site's shows up whatever zone the tests run in. */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import net from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { startStubApi } from "./stub-api.ts";

/** Testcontainers finds Docker itself, but does not look for Podman's standard sockets. */
function configureContainerRuntime() {
  if (process.env.DOCKER_HOST) return;

  const uid = process.getuid?.();
  const sockets = [
    process.env.XDG_RUNTIME_DIR && join(process.env.XDG_RUNTIME_DIR, "podman/podman.sock"),
    uid !== undefined && `/run/user/${uid}/podman/podman.sock`,
    "/run/podman/podman.sock",
    join(homedir(), ".local/share/containers/podman/machine/podman.sock"),
  ].filter((socket): socket is string => Boolean(socket));
  const socket = sockets.find(existsSync);
  if (!socket) return;

  process.env.DOCKER_HOST = `unix://${socket}`;
  // Ryuk cannot use the rootless Podman socket. Containers started here are stopped in teardown.
  if (socket !== "/run/podman/podman.sock") process.env.TESTCONTAINERS_RYUK_DISABLED ??= "true";
  if (process.platform === "darwin") process.env.TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE ??= "/var/run/docker.sock";
}

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
  const app = spawn(process.env.UI_TEST_NODE || process.execPath, ["--import", "./test/support/exit-on-term.mjs", "build/server.js"], {
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
  configureContainerRuntime();
  const [stubApi, db] = await Promise.all([startStubApi(), new PostgreSqlContainer("postgres:18").start()]);
  // A failed build exits non-zero (primate-bugs/01, primate#109).
  rmSync("build", { recursive: true, force: true });
  try {
    execFileSync("npx", ["primate", "build"], { stdio: "pipe" });
  } catch (e) {
    throw new Error(`The build failed:\n${(e as { stderr?: Buffer }).stderr || ""}${(e as { stdout?: Buffer }).stdout || ""}`);
  }

  // The pages ask the API every time (BCN_CACHE_FRESH_SECONDS 0), since tests change its answers
  // between pages; how long answers are kept is the client's own test (unit/client.test.ts).
  const env = { BCN_API_BASE: stubApi.url, BCN_DB_URL: db.getConnectionUri(), SESSION_SECRET: "a test secret, long enough to be one", BCN_CACHE_FRESH_SECONDS: "0",
    // Recordings up to 100 KB, so a too-big upload is tried with KB rather than 100 MB of test data
    BCN_RECORDING_MAX_BYTES: String(100 * 1024) };
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
