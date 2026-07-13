import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openRouterZdrProvider } from "@/lib/openrouter";

describe("openRouterZdrProvider", () => {
  it("returns provider.zdr when enabled", () => {
    assert.deepEqual(openRouterZdrProvider(true), { provider: { zdr: true } });
  });

  it("returns empty object when disabled or undefined", () => {
    assert.deepEqual(openRouterZdrProvider(false), {});
    assert.deepEqual(openRouterZdrProvider(undefined), {});
  });
});
