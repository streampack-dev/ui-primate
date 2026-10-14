/* `just coverage` (#43): the report from the raw V8 coverage the test run leaves in coverage-raw/.
   The page and browser tests drive the production build (build/server.js) in its own process, so
   its coverage is mapped back to the sources through the build's source map. That map names the
   app's files primate-app:<path>; Node copies it into each coverage file (source-map-cache), and
   those copies are rewritten here as paths relative to build/ so the bundle can be unpacked. */
import { CoverageReport } from "monocart-coverage-reports";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const raw = "coverage-raw";
const root = pathToFileURL(process.cwd()).href + "/";
const own = (s) => (s.startsWith("primate-app:") ? `../${s.slice("primate-app:".length)}` : s);

for (const name of readdirSync(raw).filter((f) => f.endsWith(".json"))) {
  const coverage = JSON.parse(readFileSync(`${raw}/${name}`, "utf8"));
  const cache = coverage["source-map-cache"];
  if (!cache) continue;
  for (const entry of Object.values(cache)) if (entry.data?.sources) entry.data.sources = entry.data.sources.map(own);
  writeFileSync(`${raw}/${name}`, JSON.stringify(coverage));
}

const report = new CoverageReport({
  name: "ui-primate",
  outputDir: "coverage",
  reports: ["console-summary", "v8", "lcovonly"],
  // The app's own code only: not node_modules, not the tests.
  entryFilter: (e) => e.url.startsWith(root) && !e.url.includes("/node_modules/") && !e.url.includes("/test/"),
  sourceFilter: (p) => {
    const path = p.replace(/^\.\.\//, "");
    return /^(src|routes|views|config|client|stores)\//.test(path) && !path.startsWith("src/api/");
  },
  sourcePath: (p) => p.replace(/^\.\.\//, ""),
});
await report.addFromDir(raw);
await report.generate();
