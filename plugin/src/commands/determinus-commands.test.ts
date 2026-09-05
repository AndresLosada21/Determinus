import { describe, expect, test } from "vitest";
import { COMMAND_MANIFEST } from "../manifest";
import {
  SDD_COMMAND_NAMES,
  buildCommandPrompt,
  buildHostCommandDefs,
  executeSddCommand,
  getSddCommandDefs,
  registerDeterminusCommands,
} from "./determinus-commands";

describe("determinus SDD commands as code (ST-03)", () => {
  test("all 9 SDD commands resolve in COMMAND_MANIFEST with gate mapping", () => {
    expect(SDD_COMMAND_NAMES).toHaveLength(9);
    const defs = getSddCommandDefs();
    expect(defs).toHaveLength(9);
    const byName = new Map(defs.map((d) => [d.name, d]));
    expect(byName.get("determinus-proposal")?.gate).toBe("proposal");
    expect(byName.get("determinus-discover")?.gate).toBe("discovery");
    expect(byName.get("determinus-design")?.gate).toBe("design");
    expect(byName.get("determinus-prep")?.gate).toBe("planning");
    expect(byName.get("determinus-apply")?.gate).toBe("execution");
    expect(byName.get("determinus-review")?.gate).toBe("acceptance");
    expect(byName.get("determinus-archive")?.gate).toBe("release");
    for (const def of defs) expect(def.description.length).toBeGreaterThan(0);
  });

  test("prompt carries phase goal, gate and change-id contract", () => {
    const def = COMMAND_MANIFEST["determinus-prep"];
    const text = buildCommandPrompt(def, "c-abc123");
    expect(text).toContain("/determinus-prep");
    expect(text).toContain(def.phaseGoal ?? "");
    expect(text).toContain("planning");
    expect(text).toContain("c-abc123");
    expect(text).toContain("determinus_*");
    // Deterministic: same inputs, same text.
    expect(buildCommandPrompt(def, "c-abc123")).toBe(text);
  });

  test("prompt falls back to args_hint when no args given", () => {
    const def = COMMAND_MANIFEST["determinus-archive"];
    expect(buildCommandPrompt(def, "")).toContain("<change-id>");
  });

  test("registration adds all 9 defs via command.transform", async () => {
    const added: any[] = [];
    const ctx: any = {
      command: {
        transform: async (fn: any) => {
          fn({ add: (def: any) => void added.push(def) });
        },
      },
    };
    await registerDeterminusCommands(ctx);
    expect(added.map((d) => d.name).sort()).toEqual(
      [...SDD_COMMAND_NAMES].sort(),
    );
    for (const def of added) {
      expect(typeof def.execute).toBe("function");
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  test("execute routes to session.prompt with the built text", async () => {
    const calls: any[] = [];
    const host: any = {
      session: { prompt: async (args: any) => void calls.push(args) },
    };
    const def = COMMAND_MANIFEST["determinus-proposal"];
    await executeSddCommand(
      def,
      { sessionID: "ses_1", prompt: "my idea" },
      host,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].sessionID).toBe("ses_1");
    expect(calls[0].text).toContain("/determinus-proposal");
    expect(calls[0].text).toContain("my idea");
  });

  test("host defs execute end-to-end through the mock", async () => {
    const calls: any[] = [];
    const host: any = {
      session: { prompt: async (args: any) => void calls.push(args) },
    };
    const defs = buildHostCommandDefs(host);
    expect(defs).toHaveLength(9);
    await defs[0].execute({ sessionID: "ses_9", prompt: "" });
    expect(calls).toHaveLength(1);
  });

  test("registration and execute never throw on hostile hosts", async () => {
    await expect(registerDeterminusCommands(undefined)).resolves.toBeDefined();
    await expect(registerDeterminusCommands({})).resolves.toBeDefined();
    const def = COMMAND_MANIFEST["determinus-review"];
    await expect(
      executeSddCommand(def, { sessionID: "s", prompt: "x" }, {}),
    ).resolves.toBeUndefined();
    await expect(
      executeSddCommand(def, undefined, undefined),
    ).resolves.toBeUndefined();
    const failing: any = {
      session: {
        prompt: async () => {
          throw new Error("boom");
        },
      },
    };
    await expect(
      executeSddCommand(def, { sessionID: "s", prompt: "x" }, failing),
    ).resolves.toBeUndefined();
  });
});
