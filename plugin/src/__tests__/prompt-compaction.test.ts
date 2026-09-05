import { it, expect } from "vitest";
import {
  compactPromptMessages,
  compactV2ToolResultPart,
  enforcePromptHistoryBudget,
} from "../index";
it("preserves complete requests, historical tool pairs and skills during replay", () => {
  const messages = Array.from({ length: 60 }, (_, i) => ({
    role: i % 2 ? "assistant" : "user",
    content: [
      { type: "text", text: "x".repeat(8000) + "DO_NOT_DELETE_DATABASE" },
    ],
  }));
  const before = JSON.stringify(messages);
  expect(compactPromptMessages(messages).compactedToolOutputs).toBe(0);
  expect(enforcePromptHistoryBudget(messages).omittedMessages).toBe(0);
  expect(JSON.stringify(messages)).toBe(before);
  const part = {
    type: "tool-result",
    name: "skill",
    result: { type: "text", value: "Rules".repeat(5000) },
  };
  const raw = JSON.stringify(part);
  expect(compactV2ToolResultPart(part)).toBe(false);
  expect(JSON.stringify(part)).toBe(raw);
});
