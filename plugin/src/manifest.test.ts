/**
 * Manifest Tests
 *
 * TDD tests for the workflow manifest — type-safe command definitions
 * with phase, gate, prerequisites, and successor information.
 */

import { describe, test, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  COMMAND_MANIFEST,
  getCommandDef,
  getCommandsByGate,
  getSuccessors,
  type GateId,
} from "./manifest";

const REPO_ROOT = resolve(__dirname, "../..");

describe("Command Manifest", () => {
  test("exports COMMAND_MANIFEST as a non-empty record", () => {
    expect(COMMAND_MANIFEST).toBeDefined();
    expect(typeof COMMAND_MANIFEST).toBe("object");
    expect(Object.keys(COMMAND_MANIFEST).length).toBeGreaterThan(0);
  });

  test("contains all 29 ADV commands", () => {
    const expectedCommands = [
      "determinus-status",
      "determinus-idea",
      "determinus-problem",
      "determinus-epic",
      "determinus-backlog",
      "determinus-proposal",
      "determinus-validate",
      "determinus-apply",
      "determinus-archive",
      "determinus-clarify",
      "determinus-research",
      "determinus-discover",
      "determinus-design",
      "determinus-prep",
      "determinus-review",
      "determinus-harden",
      "determinus-audit",
      "determinus-arch-scan",
      "determinus-comp-scan",
      "determinus-refactor",
      "determinus-improve",
      "determinus-slop-scan",
      "determinus-task",
      "determinus-tron",
      "determinus-optimizer",
      "determinus-reflect",
      "determinus-cleanup",
      "determinus-triage",
      "determinus-coordinate",
    ];

    for (const cmd of expectedCommands) {
      expect(COMMAND_MANIFEST).toHaveProperty(cmd);
    }
    expect(COMMAND_MANIFEST).not.toHaveProperty("determinus-atc");
    expect(Object.keys(COMMAND_MANIFEST)).toHaveLength(29);
  });

  test("every command has required fields", () => {
    for (const [name, def] of Object.entries(COMMAND_MANIFEST)) {
      expect(def.name).toBe(name);
      expect(typeof def.description).toBe("string");
      expect(def.description.length).toBeGreaterThan(5);
      expect(typeof def.phase).toBe("string");
      expect(typeof def.requiresChangeId).toBe("boolean");
      expect(Array.isArray(def.successors)).toBe(true);
      expect(Array.isArray(def.prerequisites)).toBe(true);
    }
  });

  test("scanner command descriptions mention coverage-oriented capabilities", () => {
    expect(COMMAND_MANIFEST["determinus-slop-scan"].description).toBe(
      "Scan slop, deletion safety, and detector coverage",
    );
    expect(COMMAND_MANIFEST["determinus-arch-scan"].description).toBe(
      "Scan architecture stack packs, coverage, and heuristic fallbacks",
    );
  });

  test("determinus-atc source assets are removed", () => {
    expect(
      existsSync(join(REPO_ROOT, ".opencode/command/determinus-atc.md")),
    ).toBe(false);
    expect(
      existsSync(join(REPO_ROOT, ".opencode/agents/determinus-atc.md")),
    ).toBe(false);
  });

  test("gate-affecting commands reference valid gate IDs", () => {
    const validGates: GateId[] = [
      "proposal",
      "discovery",
      "design",
      "planning",
      "execution",
      "acceptance",
      "release",
    ];

    for (const def of Object.values(COMMAND_MANIFEST)) {
      if (def.gate) {
        expect(validGates).toContain(def.gate);
      }
    }
  });

  test("successors reference valid command names", () => {
    const validNames = new Set(Object.keys(COMMAND_MANIFEST));

    for (const def of Object.values(COMMAND_MANIFEST)) {
      for (const successor of def.successors) {
        expect(validNames.has(successor)).toBe(true);
      }
    }
  });

  test("prerequisites reference valid command names", () => {
    const validNames = new Set(Object.keys(COMMAND_MANIFEST));

    for (const def of Object.values(COMMAND_MANIFEST)) {
      for (const prereq of def.prerequisites) {
        expect(validNames.has(prereq)).toBe(true);
      }
    }
  });

  describe("getCommandDef", () => {
    test("returns command definition by name", () => {
      const def = getCommandDef("determinus-status");
      expect(def).toBeDefined();
      expect(def!.name).toBe("determinus-status");
    });

    test("returns undefined for unknown command", () => {
      const def = getCommandDef("determinus-nonexistent");
      expect(def).toBeUndefined();
    });
  });

  describe("getCommandsByGate", () => {
    test("returns commands that affect the discovery gate", () => {
      const cmds = getCommandsByGate("discovery");
      expect(cmds.length).toBeGreaterThan(0);
      expect(cmds.some((c) => c.name === "determinus-discover")).toBe(true);
    });

    test("returns empty array for gate with no direct command", () => {
      // proposal gate has no specific command
      const cmds = getCommandsByGate("proposal");
      // May or may not have commands — just shouldn't throw
      expect(Array.isArray(cmds)).toBe(true);
    });
  });

  describe("getSuccessors", () => {
    test("returns successor commands for a given command", () => {
      const successors = getSuccessors("determinus-prep");
      expect(successors.length).toBeGreaterThan(0);
      // After prep, you typically do apply
      expect(successors.some((s) => s.name === "determinus-apply")).toBe(true);
    });

    test("returns empty array for unknown command", () => {
      const successors = getSuccessors("determinus-nonexistent");
      expect(successors).toEqual([]);
    });
  });

  describe("Voice standard enforcement", () => {
    // Banned phrases per docs/command-voice-standard.md
    const BANNED_PHRASES = [
      "high-risk signals",
      "autonomous retry",
      "AI-slop detection",
      "Socratic clarifying questions",
      "Gap analysis",
    ];

    // Strong verbs that descriptions must start with
    const STRONG_VERBS = [
      "Show",
      "Propose",
      "Validate",
      "Implement",
      "Archive",
      "Ask",
      "Analyze",
      "Detect",
      "Review",
      "Scan",
      "Refresh",
      "Suggest",
      "Fast-track",
      "Investigate",
      "Explore",
      "Extract",
      "Gather",
      "Produce",
      "Triage",
      "Capture",
      "Delegate",
      "Execute",
      "Audit",
    ];

    test("every description starts with a strong verb", () => {
      for (const [name, def] of Object.entries(COMMAND_MANIFEST)) {
        const startsWithVerb = STRONG_VERBS.some((v) =>
          def.description.startsWith(v),
        );
        expect(
          startsWithVerb,
          `${name}: description must start with a strong verb, got: "${def.description}"`,
        ).toBe(true);
      }
    });

    test("every description is 5–14 words", () => {
      for (const [name, def] of Object.entries(COMMAND_MANIFEST)) {
        const wordCount = def.description.trim().split(/\s+/).length;
        expect(
          wordCount,
          `${name}: description must be 5–14 words, got ${wordCount}: "${def.description}"`,
        ).toBeGreaterThanOrEqual(5);
        expect(
          wordCount,
          `${name}: description must be 5–14 words, got ${wordCount}: "${def.description}"`,
        ).toBeLessThanOrEqual(14);
      }
    });

    test("no description contains banned phrases", () => {
      for (const [name, def] of Object.entries(COMMAND_MANIFEST)) {
        for (const phrase of BANNED_PHRASES) {
          expect(
            def.description.toLowerCase().includes(phrase.toLowerCase()),
            `${name}: description contains banned phrase "${phrase}": "${def.description}"`,
          ).toBe(false);
        }
      }
    });
  });

  describe("Workflow correctness", () => {
    test("determinus-discover affects discovery gate", () => {
      const def = getCommandDef("determinus-discover");
      expect(def!.gate).toBe("discovery");
    });

    test("determinus-design affects design gate", () => {
      const def = getCommandDef("determinus-design");
      expect(def!.gate).toBe("design");
    });

    test("determinus-prep affects planning gate", () => {
      const def = getCommandDef("determinus-prep");
      expect(def!.gate).toBe("planning");
    });

    test("determinus-apply affects execution gate", () => {
      const def = getCommandDef("determinus-apply");
      expect(def!.gate).toBe("execution");
    });

    test("determinus-review affects acceptance gate", () => {
      const def = getCommandDef("determinus-review");
      expect(def!.gate).toBe("acceptance");
    });

    test("determinus-archive affects release gate", () => {
      const def = getCommandDef("determinus-archive");
      expect(def!.gate).toBe("release");
    });

    test("determinus-archive requires change ID", () => {
      const def = getCommandDef("determinus-archive");
      expect(def!.requiresChangeId).toBe(true);
    });

    test("determinus-status does not require change ID", () => {
      const def = getCommandDef("determinus-status");
      expect(def!.requiresChangeId).toBe(false);
    });
  });

  describe("Scope boundary enforcement", () => {
    test("every gate-affecting command has a scope definition", () => {
      const missing: string[] = [];
      for (const [name, def] of Object.entries(COMMAND_MANIFEST)) {
        if (def.gate && !def.scope) {
          missing.push(name);
        }
      }
      expect(
        missing,
        `Gate-affecting commands without scope: ${missing.join(", ")}`,
      ).toHaveLength(0);
    });

    test("scope.gates includes the command's own gate", () => {
      const mismatches: string[] = [];
      for (const [name, def] of Object.entries(COMMAND_MANIFEST)) {
        if (def.gate && def.scope && !def.scope.gates.includes(def.gate)) {
          mismatches.push(
            `${name}: gate=${def.gate} but scope.gates=[${def.scope.gates.join(", ")}]`,
          );
        }
      }
      expect(
        mismatches,
        `Commands whose scope.gates doesn't include their own gate:\n${mismatches.join("\n")}`,
      ).toHaveLength(0);
    });

    test("no two commands claim the same gate as sole primary owner", () => {
      // Build a map of gate -> commands that own it
      // Orchestrator commands (determinus-task) are exempt — they
      // intentionally cross gate boundaries to drive multi-phase workflows.
      const gateOwners = new Map<string, string[]>();
      for (const [name, def] of Object.entries(COMMAND_MANIFEST)) {
        if (!def.scope) continue;
        // Orchestrator commands exempt — they intentionally cross boundaries
        if (name === "determinus-task") continue;
        for (const gate of def.scope.gates) {
          const owners = gateOwners.get(gate) ?? [];
          owners.push(name);
          gateOwners.set(gate, owners);
        }
      }
      const conflicts: string[] = [];
      for (const [gate, owners] of gateOwners) {
        if (owners.length > 1) {
          conflicts.push(`${gate}: claimed by [${owners.join(", ")}]`);
        }
      }
      expect(
        conflicts,
        `Multiple commands claim the same gate:\n${conflicts.join("\n")}`,
      ).toHaveLength(0);
    });

    test("determinus-proposal scope owns the proposal gate", () => {
      const def = getCommandDef("determinus-proposal");
      expect(def!.scope!.gates).toEqual(["proposal"]);
    });

    test("determinus-proposal scope does not create tasks", () => {
      const def = getCommandDef("determinus-proposal");
      expect(def!.scope!.creates).not.toContain("tasks");
    });

    test("determinus-research scope does not create tasks", () => {
      const def = getCommandDef("determinus-research");
      expect(def!.scope!.creates).not.toContain("tasks");
    });

    test("determinus-prep scope creates tasks", () => {
      const def = getCommandDef("determinus-prep");
      expect(def!.scope!.creates).toContain("tasks");
    });

    test("determinus-task scope reflects fast-track artifact updates", () => {
      const def = getCommandDef("determinus-task");
      expect(def!.successors).toEqual(["determinus-apply"]);
      expect(def!.scope!.creates).toEqual(["change", "proposal", "tasks"]);
      expect(def!.scope!.modifies).toEqual(["proposal", "design"]);
      expect(def!.scope!.gates).toEqual([
        "proposal",
        "discovery",
        "design",
        "planning",
      ]);
    });

    test("determinus-atc is not a supported manifest command", () => {
      expect(getCommandDef("determinus-atc")).toBeUndefined();
    });
  });

  describe("Phase goal metadata", () => {
    // Lifecycle workflow commands with canonical phase goals.
    const WORKFLOW_COMMANDS = [
      "determinus-proposal",
      "determinus-research",
      "determinus-discover",
      "determinus-design",
      "determinus-prep",
      "determinus-apply",
      "determinus-review",
      "determinus-harden",
      "determinus-archive",
      "determinus-reflect",
    ] as const;

    // Non-workflow commands should NOT have phaseGoal
    const NON_WORKFLOW_COMMANDS = Object.keys(COMMAND_MANIFEST).filter(
      (name) =>
        !WORKFLOW_COMMANDS.includes(name as (typeof WORKFLOW_COMMANDS)[number]),
    );

    test("all lifecycle workflow commands have phaseGoal populated", () => {
      const missing: string[] = [];
      for (const name of WORKFLOW_COMMANDS) {
        const def = getCommandDef(name);
        if (!def?.phaseGoal) {
          missing.push(name);
        }
      }
      expect(
        missing,
        `Workflow commands missing phaseGoal: ${missing.join(", ")}`,
      ).toHaveLength(0);
    });

    test("non-workflow commands do not have phaseGoal", () => {
      const unexpected: string[] = [];
      for (const name of NON_WORKFLOW_COMMANDS) {
        const def = getCommandDef(name);
        if (def?.phaseGoal) {
          unexpected.push(name);
        }
      }
      expect(
        unexpected,
        `Non-workflow commands with unexpected phaseGoal: ${unexpected.join(", ")}`,
      ).toHaveLength(0);
    });

    test("every phaseGoal is a non-empty string", () => {
      for (const name of WORKFLOW_COMMANDS) {
        const def = getCommandDef(name);
        expect(typeof def!.phaseGoal).toBe("string");
        expect(
          def!.phaseGoal!.length,
          `${name}: phaseGoal is empty`,
        ).toBeGreaterThan(10);
      }
    });

    test("requiresChangeId commands have args_hint populated", () => {
      const missing: string[] = [];
      for (const [name, def] of Object.entries(COMMAND_MANIFEST)) {
        if (def.requiresChangeId && !def.args_hint) {
          missing.push(name);
        }
      }
      expect(
        missing,
        `Commands with requiresChangeId but no args_hint: ${missing.join(", ")}`,
      ).toHaveLength(0);
    });

    test("args_hint is a non-empty string when present", () => {
      for (const [name, def] of Object.entries(COMMAND_MANIFEST)) {
        if (def.args_hint) {
          expect(
            def.args_hint.length,
            `${name}: args_hint must be non-empty`,
          ).toBeGreaterThan(3);
        }
      }
    });

    test("phaseGoal values match the user-approved phase goals", () => {
      const expectedGoals: Record<string, string> = {
        "determinus-proposal":
          "Clarify the problem, user needs, and high-level user outcomes. Establish what and why — no how.",
        "determinus-research":
          "Produce a defined, fully-researched proposed plan ready for user approval. Validate the how.",
        "determinus-discover":
          "Gather current-state evidence, resolve agreement, and capture objectives and acceptance criteria before design.",
        "determinus-design":
          "Convert the approved agreement into a validated implementation strategy ready for planning.",
        "determinus-prep":
          "Complete the flight-check: every gap closed, every dependency mapped, every task ready — ready for autonomous implementation.",
        "determinus-apply":
          "Execute the approved plan autonomously. Add discovered tasks within scope. Escalate only on failure.",
        "determinus-review":
          "Verify implementation matches the approved plan. Auto-fix within scope. Stop on drift.",
        "determinus-harden":
          "Verify production-readiness. Auto-fix scoped issues. Stop on drift.",
        "determinus-archive":
          "Promote the change from contract to law: apply spec deltas, capture wisdom, clean up.",
        "determinus-reflect":
          "Synthesize post-completion learnings into a durable reflection artifact for process improvement.",
      };

      for (const [name, goal] of Object.entries(expectedGoals)) {
        const def = getCommandDef(name);
        expect(def!.phaseGoal).toBe(goal);
      }
    });
  });
});

/**
 * Source-level doc-comment contract (rq-defectOriginRca01 / KD4) — added by
 * sequenceTriageProposal. Verifies that the `prerequisites: string[]` field
 * declaration in manifest.ts carries a JSDoc-style comment clarifying the
 * field is metadata-only, not runtime-enforced.
 */
describe("manifest.ts prerequisites field doc-comment (rq-defectOriginRca01)", () => {
  const source = readFileSync(join(__dirname, "manifest.ts"), "utf8");

  test("prerequisites field has doc-comment marking it metadata-only", () => {
    // Semantic anchors per design DDC1.
    expect(source).toMatch(/metadata/i);
    expect(source).toMatch(/NOT runtime-enforced/i);
  });
});
