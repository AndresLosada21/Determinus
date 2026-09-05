/** Checkpoint behavior that remains after the Temporal transport removal. */

import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { createTempGitWorktree } from "../__tests__/setup";
import {
  buildCommitMessage,
  checkCheckpointTddEvidence,
  detectRepoState,
} from "./checkpoint";
import type { Store } from "../storage/store-types";

describe("checkpoint helpers", () => {
  test("builds a task checkpoint commit message with verification context", () => {
    expect(
      buildCommitMessage(
        "tk-abc",
        "complete",
        undefined,
        "change-1",
        "tests pass",
      ),
    ).toMatchObject({
      subject: expect.stringContaining("tk-abc"),
      body: expect.stringContaining("Verification: tests pass"),
    });
  });

  test("detects a clean repository state", async () => {
    const fixture = await createTempGitWorktree("checkpoint-state-");
    try {
      const result = await detectRepoState(fixture.worktreePath);
      expect(result).toBe("ok");
    } finally {
      await fixture.cleanup();
    }
  });
});

describe("checkpoint TDD ordering gate (ST-04, rq-TDD009seq)", () => {
  const RED = {
    runId: "tr_red",
    phase: "red",
    exitCode: 1,
    classification: "failed",
    command: "vitest run",
    durationMs: 100,
    recordedAt: "2026-01-02T00:00:00Z",
  };
  const GREEN = {
    runId: "tr_green",
    phase: "green",
    exitCode: 0,
    classification: "passed",
    command: "vitest run",
    durationMs: 100,
    recordedAt: "2026-01-02T00:01:00Z",
  };

  async function seedChange(
    changesDir: string,
    changeId: string,
    testRuns: Record<string, unknown[]>,
  ): Promise<void> {
    const dir = join(changesDir, changeId);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "change.json"),
      JSON.stringify({
        id: changeId,
        title: "Ordering change",
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
        created_by: "test",
        tasks: [],
        deltas: {},
        wisdom: [],
        test_runs: testRuns,
        gates: {},
      }),
    );
  }

  function storeFor(
    changesDir: string,
    task: { changeId?: string; metadata?: Record<string, string> } | null,
    features: Record<string, unknown> | null = null,
  ): Store {
    return {
      paths: { root: changesDir, changes: changesDir } as Store["paths"],
      config: features ? ({ features } as Store["config"]) : null,
      tasks: {
        show: async () => task,
      },
    } as unknown as Store;
  }

  async function withSeededRuns(
    testRuns: Record<string, unknown[]>,
    task: { changeId?: string; metadata?: Record<string, string> } | null,
    run: (store: Store, changesDir: string) => Promise<void>,
    features: Record<string, unknown> | null = null,
  ): Promise<void> {
    const changesDir = mkdtempSync(join(tmpdir(), "det-checkpoint-tdd-"));
    try {
      await seedChange(changesDir, "c-order", testRuns);
      await run(storeFor(changesDir, task, features), changesDir);
    } finally {
      const { rmSync } = await import("node:fs");
      rmSync(changesDir, { recursive: true, force: true });
    }
  }

  test("blocks completion without a red→green pair", async () => {
    await withSeededRuns(
      {},
      { changeId: "c-order", metadata: { tdd_intent: "inline" } },
      async (store) => {
        const result = await checkCheckpointTddEvidence(store, {
          taskId: "tk-1",
        });
        expect(result.ok).toBe(false);
        expect(result.error).toContain("TASK_ORDERING_VIOLATION");
        expect(result.remediation).toContain("determinus_run_test");
      },
    );
  });

  test("passes with an auto-detected pair and with explicit refs", async () => {
    await withSeededRuns(
      { "tk-1": [RED, GREEN] },
      { changeId: "c-order", metadata: { tdd_intent: "inline" } },
      async (store) => {
        expect(
          await checkCheckpointTddEvidence(store, { taskId: "tk-1" }),
        ).toEqual({ ok: true, advisory: undefined });
        const refs = await checkCheckpointTddEvidence(store, {
          taskId: "tk-1",
          refs: { lastRedRunId: "tr_red", lastGreenRunId: "tr_green" },
        });
        expect(refs.ok).toBe(true);
      },
    );
  });

  test("not_applicable never blocks; separate needs an evidence ref", async () => {
    await withSeededRuns(
      {},
      { changeId: "c-order", metadata: { tdd_intent: "not_applicable" } },
      async (store) => {
        expect(
          await checkCheckpointTddEvidence(store, { taskId: "tk-1" }),
        ).toEqual({ ok: true, advisory: undefined });
      },
    );
    await withSeededRuns(
      { "tk-1": [GREEN] },
      {
        changeId: "c-order",
        metadata: { tdd_intent: "separate_verification" },
      },
      async (store) => {
        const missing = await checkCheckpointTddEvidence(store, {
          taskId: "tk-1",
        });
        expect(missing.ok).toBe(false);
        const pointed = await checkCheckpointTddEvidence(store, {
          taskId: "tk-1",
          refs: { lastEvidenceRunId: "tr_green" },
        });
        expect(pointed.ok).toBe(true);
      },
    );
  });

  test("skips when the task or change cannot be loaded", async () => {
    await withSeededRuns({}, null, async (store) => {
      expect(
        await checkCheckpointTddEvidence(store, { taskId: "tk-ghost" }),
      ).toEqual({ ok: true, advisory: undefined });
    });
  });

  test("advisory warns, off skips", async () => {
    await withSeededRuns(
      {},
      { changeId: "c-order", metadata: { tdd_intent: "inline" } },
      async (store) => {
        const advisory = await checkCheckpointTddEvidence(store, {
          taskId: "tk-1",
        });
        expect(advisory.ok).toBe(true);
        expect(advisory.advisory).toContain("tk-1");
      },
      { tdd_enforcement: "advisory" },
    );
    await withSeededRuns(
      {},
      { changeId: "c-order", metadata: { tdd_intent: "inline" } },
      async (store) => {
        expect(
          await checkCheckpointTddEvidence(store, { taskId: "tk-1" }),
        ).toEqual({ ok: true, advisory: undefined });
      },
      { tdd_enforcement: "off" },
    );
  });
});
