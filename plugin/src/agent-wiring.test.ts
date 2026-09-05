import { describe, expect, test } from "vitest";
import {
  DETERMINUS_AGENT_ID,
  registerDeterminusAgent,
} from "./agent-definition";
import { registerDeterminusSessionContext } from "./hooks/session-context";
import { registerDeterminusCommands } from "./commands/determinus-commands";

interface Fixture {
  ctx: any;
  agentStore: Map<string, any>;
  sessionHooks: Array<{ name: string; cb: (event: any) => void }>;
  commandAdds: any[];
}

function mockCtx(): Fixture {
  const agentStore = new Map<string, any>();
  const sessionHooks: Fixture["sessionHooks"] = [];
  const commandAdds: any[] = [];
  const ctx: any = {
    agent: {
      transform: async (fn: (editor: any) => void) => {
        fn({
          update: (id: string, up: (agent: any) => void) => {
            const current = agentStore.get(id) ?? {};
            up(current);
            agentStore.set(id, current);
          },
        });
      },
    },
    session: {
      hook: async (name: string, cb: (event: any) => void) => {
        sessionHooks.push({ name, cb });
      },
    },
    command: {
      transform: async (fn: (editor: any) => void) => {
        fn({ add: (def: any) => void commandAdds.push(def) });
      },
    },
  };
  return { ctx, agentStore, sessionHooks, commandAdds };
}

describe("determinus host wiring (ST-02/ST-03)", () => {
  test("agent registration upserts determinus as primary with the directive", async () => {
    const { ctx, agentStore } = mockCtx();
    await registerDeterminusAgent(ctx);
    const agent = agentStore.get(DETERMINUS_AGENT_ID);
    expect(agent).toBeDefined();
    expect(agent.mode).toBe("primary");
    expect(String(agent.system)).toContain("proposal → discovery");
  });

  test("session hook enforces only for determinus primary/compaction", async () => {
    const { ctx, sessionHooks } = mockCtx();
    await registerDeterminusSessionContext(ctx);
    expect(sessionHooks.map((h) => h.name)).toContain("context");
    const cb = sessionHooks.find((h) => h.name === "context")!.cb;

    const primary: any = { agent: "determinus", kind: "primary", system: [] };
    cb(primary);
    expect(primary.system).toHaveLength(1);

    const title: any = { agent: "determinus", kind: "title", system: [] };
    cb(title);
    expect(title.system).toHaveLength(0);

    const other: any = { agent: "build", kind: "primary", system: [] };
    cb(other);
    expect(other.system).toHaveLength(0);

    expect(() => cb(undefined)).not.toThrow();
  });

  test("command registration adds the 9 SDD commands", async () => {
    const { ctx, commandAdds } = mockCtx();
    await registerDeterminusCommands(ctx);
    expect(commandAdds.map((d) => d.name).sort()).toEqual(
      [
        "determinus-apply",
        "determinus-archive",
        "determinus-design",
        "determinus-discover",
        "determinus-harden",
        "determinus-prep",
        "determinus-proposal",
        "determinus-review",
        "determinus-validate",
      ].sort(),
    );
  });

  test("all registrations tolerate hostile hosts", async () => {
    await expect(registerDeterminusAgent(undefined)).resolves.toBeDefined();
    await expect(registerDeterminusAgent({})).resolves.toBeDefined();
    await expect(
      registerDeterminusSessionContext(undefined),
    ).resolves.toBeDefined();
    await expect(registerDeterminusCommands(undefined)).resolves.toBeDefined();
  });
});
