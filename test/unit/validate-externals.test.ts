import { describe, expect, it } from "vitest";
import { plugin } from "../../src/lib/validate-externals.ts";

/* Primate 0.44's route check bundles without its native-addons plugin (primate-bugs/19), so resvg
   is left to node_modules there alone; the real build must still bundle it (#112). */
function resolved(sourcefile?: string) {
  const hooks: { filter: RegExp; callback: (args: { path: string }) => unknown }[] = [];
  plugin.setup({
    initialOptions: sourcefile ? { stdin: { sourcefile } } : {},
    onResolve: (options, callback) => hooks.push({ filter: options.filter, callback }),
  });
  return (path: string) => hooks.find(hook => hook.filter.test(path))?.callback({ path });
}

describe("resvg in Primate's route check", () => {
  it("is external there", () => {
    expect(resolved("primate-validate-routes.ts")("@resvg/resvg-js")).toEqual({ path: "@resvg/resvg-js", external: true });
  });

  it("is left alone for other packages", () => {
    expect(resolved("primate-validate-routes.ts")("satori")).toBeUndefined();
  });

  it("is bundled in the real build", () => {
    expect(resolved()("@resvg/resvg-js")).toBeUndefined();
  });
});
