/* Once, before the page and browser tests: the stub API, and the app as it ships (a production
   build, served) pointed at it. The app runs in New York's time zone, so a date shown in the
   server's local time rather than the site's shows up whatever zone the tests run in. */
import { spawn, execFileSync } from "node:child_process";
import net from "node:net";
import type { TestProject } from "vitest/node";
import { startStubApi } from "./stub-api.ts";

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

export default async function setup(project: TestProject) {
  const stubApi = await startStubApi();
  execFileSync("npx", ["primate", "build"], { stdio: "ignore" });
  const port = await freePort();
  const app = spawn("npx", ["primate", "serve"], {
    env: { ...process.env, BCN_API_BASE: stubApi.url, PORT: String(port), TZ: "America/New_York", UI_DEV: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  app.stdout.on("data", (d) => (log += d));
  app.stderr.on("data", (d) => (log += d));
  const appUrl = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(appUrl);
      break;
    } catch {
      if (i === 99) throw new Error(`The app didn't start:\n${log}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  project.provide("stubApi", stubApi.url);
  project.provide("appUrl", appUrl);
  return async () => {
    app.kill();
    await stubApi.close();
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    stubApi: string;
    appUrl: string;
  }
}
