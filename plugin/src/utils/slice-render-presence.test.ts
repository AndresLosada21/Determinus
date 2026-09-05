/** ST-13: active_slice must reach the RENDERED packet, not just the input. */

import { describe, expect, test } from "vitest";
import { renderBriefingPacket } from "./briefing-packet-renderer";

function inputFor(lane: "engineer" | "researcher") {
  return {
    change_id: "c-13",
    title: "ST-13 change",
    lane,
    tasks: [{ id: "tk-1", title: "Only slice", status: "pending" }],
    active_slice: {
      active_slice: "tk-1",
      scenario: "Only slice",
      design: "",
      tdd_state: "TEST_READY",
      allowed: ["edit tests", "run active TestCase"],
      forbidden: ["production behavior changes", "complete task"],
      target: "reach RED_PROVEN",
    },
  };
}

describe("briefing slice render (ST-13)", () => {
  test("engineer packet renders the active slice", () => {
    const packet = renderBriefingPacket(inputFor("engineer"));
    const kinds = packet.sections.map((s) => s.kind);
    expect(kinds).toContain("active_slice");
    const slice = packet.sections.find((s) => s.kind === "active_slice");
    expect(JSON.stringify(slice?.content)).toContain("TEST_READY");
  });

  test("lanes without slice coverage omit it cleanly", () => {
    const packet = renderBriefingPacket(inputFor("researcher"));
    expect(packet.sections.map((s) => s.kind)).not.toContain("active_slice");
  });
});
