import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateContextBreakdown } from "@/lib/estimate-context";
import type { Message } from "@/lib/types";

describe("estimateContextBreakdown", () => {
  it("does not count assistant reasoning (UI-only)", () => {
    const withReasoning: Message[] = [
      {
        id: "a1",
        role: "assistant",
        content: "Hello",
        reasoning: "x".repeat(4000),
        createdAt: 1,
      },
    ];
    const withoutReasoning: Message[] = [
      {
        id: "a1",
        role: "assistant",
        content: "Hello",
        createdAt: 1,
      },
    ];

    const a = estimateContextBreakdown({ messages: withReasoning });
    const b = estimateContextBreakdown({ messages: withoutReasoning });
    assert.equal(a.messages, b.messages);
    assert.equal(a.total, b.total);
  });

  it("counts memoryContext separately from system", () => {
    const systemPrompt = "You are helpful.";
    const memoryContext = "The following are things you should remember:\n\n- Likes tea";

    const breakdown = estimateContextBreakdown({
      systemPrompt,
      memoryContext,
      messages: [],
    });

    assert.ok(breakdown.system > 0);
    assert.ok(breakdown.memory > 0);
    assert.equal(breakdown.total, breakdown.system + breakdown.memory);
  });

  it("ignores empty memoryContext", () => {
    const breakdown = estimateContextBreakdown({
      systemPrompt: "Hi",
      memoryContext: "   ",
      messages: [],
    });
    assert.equal(breakdown.memory, 0);
  });
});
