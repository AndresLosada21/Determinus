import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { determinus_TOOL_NAMES } from "./tool-registry";

const REPO_ROOT = resolve(__dirname, "../..");
const ADVANCE_META_SPEC = join(REPO_ROOT, ".adv/specs/advance-meta/spec.json");
const determinus_CLI = join(REPO_ROOT, "bin/adv");
const determinus_STATUS_LIVE = join(REPO_ROOT, "bin/lib/live-status.ts");
const determinus_EPIC_LIST = join(REPO_ROOT, "bin/lib/epic-list.ts");

function readAdvanceMetaSpec(): {
  requirements?: Array<{
    id?: string;
    priority?: string;
    body?: string;
    scenarios?: Array<{ id?: string }>;
  }>;
} {
  return JSON.parse(readFileSync(ADVANCE_META_SPEC, "utf8"));
}

interface BridgeCase {
  command: string;
  token: string;
  specId: string;
}

const BRIDGES: BridgeCase[] = [
  {
    command: ".opencode/command/determinus-status.md",
    token: "!`adv status --no-color`",
    specId: "rq-statusCliBridge01",
  },
];

const FORBIDDEN_FANOUT_TOKENS = [
  "determinus_status",
  "determinus_change_list",
  "determinus_change_show",
  "determinus_gate_status",
  "determinus_spec",
  "Recommendations:",
  "active_change",
];

describe("CLI bridge command contracts", () => {
  for (const bridge of BRIDGES) {
    const absPath = join(REPO_ROOT, bridge.command);
    const name = bridge.command.split("/").pop() ?? bridge.command;

    describe(name, () => {
      test("bridge token is present", () => {
        const content = readFileSync(absPath, "utf8");
        expect(content).toContain(bridge.token);
      });

      test("requires verbatim output and forbids analysis", () => {
        const content = readFileSync(absPath, "utf8");
        expect(content).toMatch(/return this command output verbatim/i);
        expect(content).toMatch(/do not analyze/i);
        expect(content).toMatch(/do not .*recommendations/i);
      });

      test("does not instruct ADV MCP fanout", () => {
        const content = readFileSync(absPath, "utf8");
        const found = FORBIDDEN_FANOUT_TOKENS.filter((token) =>
          content.includes(token),
        );
        expect(
          found,
          `${name} must stay a CLI bridge, not a prompt-driven workflow`,
        ).toEqual([]);
      });

      test(`advance-meta spec pins ${bridge.specId}`, () => {
        const spec = readAdvanceMetaSpec();
        const requirement = spec.requirements?.find(
          (item) => item.id === bridge.specId,
        );
        expect(requirement).toMatchObject({
          id: bridge.specId,
          priority: "must",
        });
        expect(requirement?.scenarios?.map((s) => s.id)).toEqual([
          `${bridge.specId}.1`,
          `${bridge.specId}.2`,
          `${bridge.specId}.3`,
        ]);
      });
    });
  }

  test("status bridge law requires live-default status with no silent stale fallback", () => {
    const spec = readAdvanceMetaSpec();
    const requirement = spec.requirements?.find(
      (item) => item.id === "rq-statusCliBridge01",
    );
    const body = requirement?.body ?? "";
    const scenarioText = JSON.stringify(requirement?.scenarios ?? []);
    const lawText = `${body}\n${scenarioText}`;

    expect(lawText).toMatch(/thin OpenCode shell-output bridge/i);
    expect(lawText).toMatch(/must not silently render stale/i);
  });
});

describe("REGISTRY NO-REMOVAL GUARD (AC6/DONT1)", () => {
  test("determinus_TOOL_NAMES matches frozen snapshot", () => {
    // consolidateAdvToolSurface2: canonical names are now derived from the
    // typed public-group inventory (tool-registry.ts). This guard still pins
    // the exact name SET — any silent addition or removal fails — but no
    // longer couples to incidental inventory group ordering.
    const frozen: readonly string[] = [
      "determinus_spec",
      "determinus_wip_state",
      "determinus_change_list",
      "determinus_change_show",
      "determinus_change_create",
      "determinus_change_update",
      "determinus_change_close",
      "determinus_change_archive",
      "determinus_change_reenter",
      "determinus_ops_run_upsert",
      "determinus_ops_run_evidence_add",
      "determinus_task_show",
      "determinus_task_list",
      "determinus_task_ready",
      "determinus_task_update",
      "determinus_task_add",
      "determinus_task_cancel",
      "determinus_subagent_report_submit",
      "determinus_wisdom_add",
      "determinus_wisdom_list",
      "determinus_status",
      "determinus_project_context",
      "determinus_gate_status",
      "determinus_gate_complete",
      "determinus_run_test",
      "determinus_tool_catalog",
      "determinus_tool_describe",
      "determinus_tool_invoke",
      "determinus_task_checkpoint",
      "determinus_reflection_list",
      "determinus_reflect",
      "determinus_worktree_create",
      "determinus_worktree_delete",
      "determinus_worktree_cleanup",
      "determinus_worktree_triage",
    ];
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect([...determinus_TOOL_NAMES].sort(byName)).toEqual(
      [...frozen].sort(byName),
    );
  });
});

describe("NO-CLI-MUTATION GUARD (AC9/DONT3)", () => {
  test("bin/adv dispatch only recognizes safe subcommands", () => {
    const content = readFileSync(determinus_CLI, "utf8");

    const allowedDispatch = ["status"];
    const allowedGlobalFlags = ["help", "version"];
    const forbidden = [
      "create",
      "update",
      "close",
      "archive",
      "gate",
      "task",
      "delete",
      "reenter",
      "mint",
      "lock",
      "unlock",
    ];

    // Sanity: allowed subcommand dispatch strings are present
    for (const sub of allowedDispatch) {
      expect(content).toContain(`"${sub}"`);
    }

    // Sanity: global flags / functions are present
    for (const sub of allowedGlobalFlags) {
      expect(
        content.includes(`run${sub.charAt(0).toUpperCase() + sub.slice(1)}`) ||
          content.includes(`"${sub}"`),
      ).toBe(true);
    }

    // Forbidden mutation verbs must not appear as subcommand dispatch strings.
    // We look for the exact dispatch pattern (=== "verb") to avoid false
    // positives from variable names like archiveDir.
    const found = forbidden.filter((verb) => content.includes(`=== "${verb}"`));
    expect(
      found,
      "bin/adv must not contain mutation subcommand dispatch",
    ).toEqual([]);
  });

  test("epic CLI namespace only exposes read-only list dispatch", () => {
    const content = readFileSync(determinus_CLI, "utf8");
    const epicList = readFileSync(determinus_EPIC_LIST, "utf8");

    expect(content).toContain("EPIC_READ_ONLY_SUBCOMMANDS");
    expect(content).toContain('"list"');

    const forbidden = [
      "create",
      "update",
      "delete",
      "archive",
      "close",
      "gate",
      "task",
    ];
    const nestedDispatch = forbidden.filter(
      (verb) =>
        content.includes(`nested === "${verb}"`) ||
        content.includes(`EPIC_READ_ONLY_SUBCOMMANDS.has("${verb}")`),
    );
    expect(nestedDispatch, "epic namespace must remain read-only").toEqual([]);

    expect(epicList).toContain("loadLiveEpics");
    expect(epicList).not.toContain("getHandle(");
    expect(epicList).toContain("readFileSync");
  });
});

describe("STATUS LIVE DEFAULT GUARDS (AC8/AC9/AC10)", () => {
  test("status live client does not import workflow sandbox modules", () => {
    const content = readFileSync(determinus_STATUS_LIVE, "utf8");
    const forbidden = [
      "temporal/messages",
      "temporal/workflows",
      "./messages",
      "./workflows",
    ];

    expect(forbidden.filter((token) => content.includes(token))).toEqual([]);
  });

  test("default status reads active rows from the disk projection reader", () => {
    const cli = readFileSync(determinus_CLI, "utf8");
    const liveStatus = readFileSync(determinus_STATUS_LIVE, "utf8");

    expect(cli).toContain("loadLiveSummaries");
    expect(liveStatus).toContain("loadSummariesFromDisk");
    expect(liveStatus).toContain('source: "disk"');
  });

  test("status live implementation has no mutation authority", () => {
    const content = `${readFileSync(determinus_CLI, "utf8")}\n${readFileSync(
      determinus_STATUS_LIVE,
      "utf8",
    )}`;
    const forbidden = [
      ".signal(",
      ".start(",
      "executeUpdate",
      "taskAdded",
      "taskUpdated",
      "gateCompleted",
      '=== "archive"',
      '=== "cancel"',
      "temporal_worker_restart",
      "worker_restart",
    ];

    expect(forbidden.filter((token) => content.includes(token))).toEqual([]);
  });
});
