/**
 * SDD+TDD lifecycle end-to-end (ST-07a/b).
 *
 * Drives the REAL tools against a REAL disk store in a temp git worktree —
 * no store mocks:
 * change_create → task_add (inline) → gates proposal→planning →
 * run_test red (failing) → run_test green (passing) →
 * task_checkpoint complete → gate_complete execution
 * (+ extension probe: acceptance → release → archive).
 *
 * This is the EPIC objective exercised: TDD hard enforcement accepts a true
 * red→green pair and the execution gate closes on paired evidence.
 */

import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { createTempGitWorktree } from "../__tests__/setup";
import { createDiskStore } from "../storage/store-disk";
import type { Store } from "../storage/store-types";
import { loadChange } from "../storage/change-projection-reader";
import { changeTools } from "./change";
import { taskTools } from "./task";
import { testTools } from "./test";
import { checkpointTools } from "./checkpoint";
import { gateTools } from "./gate";

function parse(output: string): any {
  return JSON.parse(output);
}

interface LifecycleCore {
  fixture: {
    repoRoot: string;
    worktreePath: string;
    cleanup: () => Promise<void>;
  };
  cleanupCwd: () => void;
  store: Store;
  worktreePath: string;
  changeId: string;
  taskId: string;
}

/** Steps 1–7: proposal → execution with a true red→green pair. */
async function runLifecycleCore(): Promise<LifecycleCore> {
  const fixture = await createTempGitWorktree("determinus-lifecycle-");
  // Mutating tools resolve the session checkout from process.cwd():
  // run the whole lifecycle as if the session lived in the worktree.
  const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(fixture.worktreePath);
  const cleanupCwd = () => cwdSpy.mockRestore();
  const { worktreePath, repoRoot } = fixture;
  const store: Store = await createDiskStore(worktreePath, {
    externalRoot: join(repoRoot, "adv-state"),
  });
  if (typeof (store as any).init === "function") {
    await (store as any).init();
  }

  // 1. proposal
  const created = parse(
    await (changeTools as any).determinus_change_create.execute(
      { summary: "Add lifecycle probe" },
      store,
    ),
  );
  const changeId: string = created.changeId ?? created.id ?? created.change?.id;
  expect(changeId, "change_create returns a change id").toMatch(
    /^[A-Za-z0-9-]+$/,
  );

  // 2. planning input: one inline code task (before planning closes)
  const added = parse(
    await (taskTools as any).determinus_task_add.execute(
      {
        changeId,
        content: "Probe task\nRed then green via git diff --check.",
        metadata: { tdd_intent: "inline" },
      },
      store,
    ),
  );
  const taskId: string = added.taskId ?? added.id ?? added.task?.id;
  expect(taskId, "task_add returns a task id").toMatch(/^tk-/);

  // 3. gates proposal → planning (planning needs user approval)
  for (const gateId of ["proposal", "discovery", "design"] as const) {
    const done = parse(
      await (gateTools as any).determinus_gate_complete.execute(
        { changeId, gateId },
        store,
      ),
    );
    expect(done.success, `gate ${gateId} completes: ${done.error ?? ""}`).toBe(
      true,
    );
  }
  const planning = parse(
    await (gateTools as any).determinus_gate_complete.execute(
      { changeId, gateId: "planning", userApproved: true },
      store,
    ),
  );
  expect(
    planning.success,
    `planning completes: ${planning.error ?? JSON.stringify(planning.readinessFailures ?? planning)}`,
  ).toBe(true);

  // 4. red: intent-to-add makes the untracked content visible to
  // git diff --check; the trailing whitespace fails with nonzero exit.
  const probeFile = join(worktreePath, "probe.txt");
  await writeFile(probeFile, "trailing space \n");
  execFileSync("git", ["add", "-N", "probe.txt"], { cwd: worktreePath });
  const red = parse(
    await (testTools as any).determinus_run_test.execute(
      {
        taskId,
        command: "git diff --check",
        phase: "red",
        workdir: worktreePath,
      },
      store,
      worktreePath,
    ),
  );
  expect(red.passed ?? red.success, "red run fails").toBeFalsy();
  const redRunId: string | undefined = red.runId;
  expect(redRunId, "red run returns a runId").toMatch(/^tr_/);

  // 5. green: fix the file, diff is clean
  await writeFile(probeFile, "clean\n");
  const green = parse(
    await (testTools as any).determinus_run_test.execute(
      {
        taskId,
        command: "git diff --check",
        phase: "green",
        workdir: worktreePath,
      },
      store,
      worktreePath,
    ),
  );
  expect(
    green.passed ?? green.success,
    `green run passes: ${JSON.stringify(green).slice(0, 400)}`,
  ).toBeTruthy();

  // 6. checkpoint completes the task (ordering pre-check passes)
  const checkpointed = parse(
    await (checkpointTools as any).determinus_task_checkpoint.execute(
      {
        taskId,
        workdir: worktreePath,
        verification: "git diff --check clean after whitespace fix",
        expectedBranch: "change/test",
      },
      store,
      worktreePath,
    ),
  );
  expect(
    ["committed", "clean"].includes(checkpointed.status),
    `checkpoint completes: ${JSON.stringify(checkpointed).slice(0, 500)}`,
  ).toBe(true);
  expect(checkpointed.checkpointRecorded).toBe(true);

  // 7. execution gate closes on paired evidence
  const execution = parse(
    await (gateTools as any).determinus_gate_complete.execute(
      { changeId, gateId: "execution" },
      store,
    ),
  );
  expect(
    execution.success,
    `execution completes: ${execution.error ?? ""}`,
  ).toBe(true);

  return { fixture, cleanupCwd, store, worktreePath, changeId, taskId };
}

describe("sdd+tdd lifecycle end-to-end", () => {
  test("proposal→execution with a true red→green pair", async () => {
    const core = await runLifecycleCore();
    try {
      // 8. durable proof: task done + pair persisted in the projection
      const loaded = await loadChange(core.store.paths.changes, core.changeId);
      expect(loaded.success).toBe(true);
      const task = (loaded.data as any)?.tasks?.find(
        (t: any) => t.id === core.taskId,
      );
      expect(task?.status).toBe("done");
      const runs = (loaded.data as any)?.test_runs?.[core.taskId] ?? [];
      const classifications = runs.map((r: any) => r.classification);
      expect(classifications).toContain("failed");
      expect(classifications).toContain("passed");
    } finally {
      core.cleanupCwd();
      await core.fixture.cleanup();
    }
  }, 120_000);

  test("extension probe: acceptance passes, release needs a live remote", async () => {
    const core = await runLifecycleCore();
    try {
      const { store, changeId } = core;
      const acceptance = parse(
        await (gateTools as any).determinus_gate_complete.execute(
          { changeId, gateId: "acceptance" },
          store,
        ),
      );
      expect(
        acceptance.success,
        `acceptance completes: ${acceptance.error ?? ""}`,
      ).toBe(true);

      // Release finalization requires a trunk merge against a live remote
      // (rq-releaseFinalization01) — unproducible in an isolated fixture
      // with no remote. Assert the exact boundary instead of the merge.
      const release = parse(
        await (gateTools as any).determinus_gate_complete.execute(
          { changeId, gateId: "release" },
          store,
        ),
      );
      expect(release.code).toBe("RELEASE_REQUIRES_TRUNK_MERGE");
    } finally {
      core.cleanupCwd();
      await core.fixture.cleanup();
    }
  }, 120_000);
});
