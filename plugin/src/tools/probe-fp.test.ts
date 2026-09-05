import { describe, expect, test } from "vitest";

describe("probe fp", () => {
  test("red case", () => {
    expect(200).toBe(403);
  });
  test("green case", () => {
    expect(200).toBe(200);
  });
});
