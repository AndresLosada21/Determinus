/**
 * ADV Command Manifest
 *
 * Type-safe workflow manifest defining all ADV commands with their
 * phase, gate affinity, prerequisites, and successors.
 * rq-M4n1f3s1: status/workflow recommendations derive from this typed manifest.
 *
 * Used by command tooling for command metadata and workflow sequencing.
 * TypeScript constant — compile-time checked, zero parse overhead.
 */

import type { GateId } from "./types";

// =============================================================================
// Types
// =============================================================================

export type Phase =
  | "core"
  | "pre-implementation"
  | "implementation"
  | "post-implementation"
  | "advanced"
  | "utility";

/** Defines what a command is allowed to create, read, modify, and which gate it owns. */
export interface CommandScope {
  /** ADV artifacts this command creates (e.g., 'change', 'tasks') */
  creates: string[];
  /** ADV artifacts this command reads */
  reads: string[];
  /** ADV artifacts this command modifies */
  modifies: string[];
  /** Gate(s) this command is authorized to complete */
  gates: GateId[];
}

export interface CommandDef {
  /** Command name (without /) */
  name: string;
  /** Short description */
  description: string;
  /** Workflow phase */
  phase: Phase;
  /** Which gate this command affects (if any) */
  gate?: GateId;
  /** Whether the command requires a change ID argument */
  requiresChangeId: boolean;
  /**
   * Command prerequisites — metadata describing expected prior commands.
   * NOT runtime-enforced: no layer reads this array to block invocation.
   * Advisory routing hints live in .opencode/agents/adv.md Step 1.
   */
  prerequisites: string[];
  /** Commands to recommend after this one completes */
  successors: string[];
  /** Boundary scope: what this command creates, reads, modifies, and which gates it owns */
  scope?: CommandScope;
  /**
   * HITL phase goal — canonical description of this command's objective (workflow commands only).
   * Agents should self-check: "Am I still working toward this phase's goal?"
   */
  phaseGoal?: string;
  /**
   * Hint for $ARGUMENTS parsing — describes expected arguments.
   * Required when requiresChangeId is true.
   */
  args_hint?: string;
}

// =============================================================================
// Manifest
// =============================================================================

export const COMMAND_MANIFEST: Record<string, CommandDef> = {
  // ---- Core Workflow ----
  "determinus-status": {
    name: "determinus-status",
    description: "Show fast ADV status table",
    phase: "core",
    requiresChangeId: false,
    prerequisites: [],
    successors: [
      "determinus-proposal",
      "determinus-apply",
      "determinus-triage",
    ],
  },
  "determinus-proposal": {
    name: "determinus-proposal",
    description:
      "Extract problem statement, user outcomes, and constraints without creating tasks",
    phase: "core",
    gate: "proposal",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["determinus-clarify", "determinus-research"],
    scope: {
      creates: ["change", "proposal"],
      reads: ["specs"],
      modifies: [],
      gates: ["proposal"],
    },
    phaseGoal:
      "Clarify the problem, user needs, and high-level user outcomes. Establish what and why \u2014 no how.",
  },
  "determinus-validate": {
    name: "determinus-validate",
    description:
      "Validate change compliance against specs; block archive on failure",
    phase: "core",
    requiresChangeId: true,
    prerequisites: ["determinus-proposal"],
    successors: ["determinus-archive"],
    args_hint: "<change-id> [--strict]",
  },
  "determinus-archive": {
    name: "determinus-archive",
    description: "Archive completed change: apply spec deltas and finalize git",
    phase: "core",
    gate: "release",
    requiresChangeId: true,
    prerequisites: ["determinus-harden"],
    successors: [],
    scope: {
      creates: ["archive"],
      reads: ["specs", "proposal", "tasks", "codebase"],
      modifies: ["specs"],
      gates: ["release"],
    },
    phaseGoal:
      "Promote the change from contract to law: apply spec deltas, capture wisdom, clean up.",
    args_hint: "<change-id>",
  },

  // ---- Pre-Implementation (Ideation + Discovery + Design + Planning) ----
  "determinus-idea": {
    name: "determinus-idea",
    description: "Explore rough ideas before drafting a proposal",
    phase: "pre-implementation",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["determinus-proposal", "determinus-epic"],
    scope: {
      creates: [],
      reads: ["specs", "codebase"],
      modifies: [],
      gates: [],
    },
  },
  "determinus-problem": {
    name: "determinus-problem",
    description:
      "Triage defects and unintended behavior before fixing or drafting a proposal",
    phase: "pre-implementation",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["determinus-proposal", "determinus-epic"],
    scope: {
      creates: [],
      reads: ["specs", "codebase"],
      modifies: [],
      gates: [],
    },
  },
  "determinus-epic": {
    name: "determinus-epic",
    description: "Gather Epic goals before typed creation",
    phase: "pre-implementation",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["determinus-proposal"],
    scope: {
      creates: ["epic"],
      reads: ["specs", "epics", "changes", "backlog"],
      modifies: ["epic"],
      gates: [],
    },
  },
  "determinus-backlog": {
    name: "determinus-backlog",
    description:
      "Capture future work as backlog-status changes before proposal",
    phase: "pre-implementation",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["determinus-epic", "determinus-proposal"],
    scope: {
      creates: ["backlog_item"],
      reads: ["backlog", "epics"],
      modifies: ["backlog_item"],
      gates: [],
    },
  },
  "determinus-clarify": {
    name: "determinus-clarify",
    description: "Ask clarifying questions to resolve ambiguous requirements",
    phase: "pre-implementation",
    requiresChangeId: false,
    prerequisites: ["determinus-proposal"],
    successors: ["determinus-research", "determinus-discover"],
  },
  "determinus-research": {
    name: "determinus-research",
    description:
      "Produce a defined, fully-researched proposed plan ready for user approval",
    phase: "pre-implementation",
    requiresChangeId: false,
    prerequisites: ["determinus-proposal"],
    successors: ["determinus-discover", "determinus-prep"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "codebase"],
      modifies: ["proposal"],
      gates: [],
    },
    phaseGoal:
      "Produce a defined, fully-researched proposed plan ready for user approval. Validate the how.",
  },
  "determinus-discover": {
    name: "determinus-discover",
    description:
      "Gather context, analyze current state, identify objectives, and obtain user agreement",
    phase: "pre-implementation",
    gate: "discovery",
    requiresChangeId: true,
    prerequisites: ["determinus-proposal"],
    successors: ["determinus-design"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "codebase"],
      modifies: ["proposal"],
      gates: ["discovery"],
    },
    phaseGoal:
      "Gather current-state evidence, resolve agreement, and capture objectives and acceptance criteria before design.",
    args_hint: "<change-id>",
  },
  "determinus-design": {
    name: "determinus-design",
    description:
      "Validate architecture decisions, produce implementation strategy, and present design for user review",
    phase: "pre-implementation",
    gate: "design",
    requiresChangeId: true,
    prerequisites: ["determinus-discover"],
    successors: ["determinus-prep"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "codebase"],
      modifies: ["proposal"],
      gates: ["design"],
    },
    phaseGoal:
      "Convert the approved agreement into a validated implementation strategy ready for planning.",
    args_hint: "<change-id>",
  },
  "determinus-prep": {
    name: "determinus-prep",
    description:
      "Analyze gaps and synthesize tasks from approved agreement plus validated design",
    phase: "pre-implementation",
    gate: "planning",
    requiresChangeId: true,
    prerequisites: ["determinus-design"],
    successors: ["determinus-apply"],
    scope: {
      creates: ["tasks"],
      reads: ["specs", "proposal", "codebase"],
      modifies: ["tasks", "proposal"],
      gates: ["planning"],
    },
    phaseGoal:
      "Complete the flight-check: every gap closed, every dependency mapped, every task ready \u2014 ready for autonomous implementation.",
    args_hint: "<change-id>",
  },
  "determinus-reflect": {
    name: "determinus-reflect",
    description:
      "Produce a structured two-plane reflection report for an archived change",
    phase: "post-implementation",
    requiresChangeId: true,
    prerequisites: ["determinus-archive"],
    successors: [],
    scope: {
      reads: ["specs", "proposal", "tasks"],
      creates: ["reflection"],
      modifies: [],
      gates: [],
    },
    phaseGoal:
      "Synthesize post-completion learnings into a durable reflection artifact for process improvement.",
    args_hint: "<change-id>",
  },

  // ---- Implementation ----
  "determinus-apply": {
    name: "determinus-apply",
    description:
      "Implement change with TDD, retry on failure, and final verification",
    phase: "implementation",
    gate: "execution",
    requiresChangeId: true,
    prerequisites: ["determinus-prep"],
    successors: ["determinus-apply"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "tasks", "codebase"],
      modifies: ["tasks", "codebase"],
      gates: ["execution"],
    },
    phaseGoal:
      "Execute the approved plan autonomously. Add discovered tasks within scope. Escalate only on failure.",
    args_hint: "<change-id>",
  },
  "determinus-task": {
    name: "determinus-task",
    description:
      "Fast-track small changes: assess spec-law impact, prep, and hand off",
    phase: "implementation",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["determinus-apply"],
    scope: {
      creates: ["change", "proposal", "tasks"],
      reads: ["specs", "codebase"],
      modifies: ["proposal", "design"],
      gates: ["proposal", "discovery", "design", "planning"],
    },
  },
  // ---- Post-Implementation ----
  "determinus-review": {
    name: "determinus-review",
    description:
      "Review code for correctness, security, and architecture; emit REVIEW_FINDINGS",
    phase: "post-implementation",
    gate: "acceptance",
    requiresChangeId: true,
    prerequisites: ["determinus-apply"],
    successors: ["determinus-harden"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "tasks", "codebase"],
      modifies: ["proposal"],
      gates: ["acceptance"],
    },
    phaseGoal:
      "Verify implementation matches the approved plan. Auto-fix within scope. Stop on drift.",
    args_hint: "<change-id>",
  },
  "determinus-harden": {
    name: "determinus-harden",
    description:
      "Detect low-quality code, verify test coverage, clean up; block archive on open findings",
    phase: "post-implementation",
    requiresChangeId: true,
    prerequisites: ["determinus-review"],
    successors: ["determinus-validate", "determinus-archive"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "tasks", "codebase"],
      modifies: ["codebase"],
      gates: [],
    },
    phaseGoal:
      "Verify production-readiness. Auto-fix scoped issues. Stop on drift.",
    args_hint: "<change-id>",
  },
  "determinus-audit": {
    name: "determinus-audit",
    description: "Detect drift between specs and current implementation",
    phase: "post-implementation",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["determinus-proposal"],
  },
  "determinus-slop-scan": {
    name: "determinus-slop-scan",
    description: "Scan slop, deletion safety, and detector coverage",
    phase: "post-implementation",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["determinus-harden"],
  },

  // ---- Advanced ----
  "determinus-refactor": {
    name: "determinus-refactor",
    description:
      "Refresh a stale proposal or batch-refresh the oldest 30% of active changes",
    phase: "advanced",
    requiresChangeId: false,
    prerequisites: ["determinus-proposal"],
    successors: ["determinus-prep"],
    args_hint: "[change-id]",
  },
  "determinus-cleanup": {
    name: "determinus-cleanup",
    description:
      "Triage stale changes, drifted worktrees, merged branches, and state leaks; delete approved candidates",
    phase: "advanced",
    requiresChangeId: false,
    prerequisites: [],
    successors: [],
    args_hint: "[--execute] [--bucket <name>] [--age-threshold <duration>]",
  },
  "determinus-coordinate": {
    name: "determinus-coordinate",
    description:
      "Audit project changes, Epic alignment, sequencing, and membership health; includes Epic-unlinked in-flight changes",
    phase: "advanced",
    requiresChangeId: false,
    prerequisites: [],
    successors: [],
    scope: {
      creates: [],
      reads: ["specs", "epics", "changes"],
      modifies: [],
      gates: [],
    },
  },

  // ---- Utility ----
  "determinus-improve": {
    name: "determinus-improve",
    description:
      "Analyze improvements across existing specs, implementation, and external landscape",
    phase: "utility",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["determinus-proposal", "determinus-task", "determinus-audit"],
  },
  "determinus-arch-scan": {
    name: "determinus-arch-scan",
    description:
      "Scan architecture stack packs, coverage, and heuristic fallbacks",
    phase: "utility",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["determinus-proposal"],
  },
  "determinus-comp-scan": {
    name: "determinus-comp-scan",
    description:
      "Scan competitor capabilities against this project for competitive intelligence",
    phase: "utility",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["determinus-proposal"],
  },
  "determinus-tron": {
    name: "determinus-tron",
    description:
      "Investigate codebase structure, hotspots, risks, and suggest follow-up candidates",
    phase: "utility",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["determinus-proposal", "determinus-task"],
  },
  "determinus-optimizer": {
    name: "determinus-optimizer",
    description:
      "Analyze code simplification opportunities and propose optimizer changes",
    phase: "utility",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["determinus-proposal", "determinus-task"],
  },
  "determinus-triage": {
    name: "determinus-triage",
    description:
      "Triage sources, coalesce issue links, assign bug priority, and balance portfolio",
    phase: "utility",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["determinus-proposal", "determinus-task"],
    args_hint: "[--execute] [--no-commit] [--source <name>]",
  },
} as const satisfies Record<string, CommandDef>;

// =============================================================================
// Lookup Helpers
// =============================================================================

/**
 * Get command definition by name.
 */
export function getCommandDef(name: string): CommandDef | undefined {
  return COMMAND_MANIFEST[name];
}

/**
 * Get all commands that affect a specific gate.
 */
export function getCommandsByGate(gate: GateId): CommandDef[] {
  return Object.values(COMMAND_MANIFEST).filter((cmd) => cmd.gate === gate);
}

/**
 * Get successor command definitions for a given command.
 */
export function getSuccessors(name: string): CommandDef[] {
  const def = COMMAND_MANIFEST[name];
  if (!def) return [];
  return def.successors
    .map((s) => COMMAND_MANIFEST[s])
    .filter((d): d is CommandDef => d !== undefined);
}
