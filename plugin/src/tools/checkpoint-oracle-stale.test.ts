/** ST-12: oracle wiring + live-documents revision at checkpoint level. */

import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { checkCheckpointTddEvidence } from "./checkpoint";
import { computeSpecRevision } from "../utils/spec-revision";
import type { Store } from "../storage/store-types";

const DOC_V1 = { proposal: "spec v1", design: "d1" };
const DOC_V2 = { proposal: "spec v2", design: "d1" };

function runsWithRev(specRevision: string) {
  return {
    "tk-12": [
      {
        runId: "tr_r",
        phase: "red",
        exitCode: 1,
        classification: "failed",
        command: "vitest run",
        durationMs: 100,
        recordedAt: "2026-01-02T00:00:00Z",
        failure_class: "assertion_failure",
        failure_signal: "expected 401 but received 200",
        test_fingerprint: "file:aaa",
        spec_revision: specRevision,
      },
      {
        runId: "tr_g",
        phase: "green",
        exitCode: 0,
        classification: "passed",
        command: "vitest run",
        durationMs: 100,
        recordedAt: "2026-01-02T00:01:00Z",
        test_fingerprint: "file:aaa",
        spec_revision: specRevision,
      },
    ],
  };
}

function infraRuns(specRevision: string) {
  return {
    "tk-12": [
      {
        runId: "tr_r",
        phase: "red",
        exitCode: 1,
        classification: "failed",
        command: "vitest run",
        durationMs: 100,
        recordedAt: "2026-01-02T00:00:00Z",
        failure_class: "module_not_found",
        failure_signal: "Cannot find module x",
        test_fingerprint: "file:aaa",
        spec_revision: specRevision,
      },
      {
        runId: "tr_g",
        phase: "green",
        exitCode: 0,
        classification: "passed",
        command: "vitest run",
        durationMs: 100,
        recordedAt: "2026-01-02T00:01:00Z",
        test_fingerprint: "file:aaa",
        spec_revision: specRevision,
      },
    ],
  };
}

async function seed(
  changesDir: string,
  opts: {
    documents?: Record<string, unknown>;
    testRuns: Record<string, unknown[]>;
  },
): Promise<void> {
  const dir = join(changesDir, "c-12");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "change.json"),
    JSON.stringify({
      id: "c-12",
      title: "ST-12 change",
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      created_by: "test",
      tasks: [],
      deltas: {},
      wisdom: [],
      test_runs: opts.testRuns,
      gates: {},
      ...(opts.documents ? { documents: opts.documents } : {}),
    }),
  );
}

function storeFor(changesDir: string, metadata: Record<string, string>): Store {
  return {
    paths: { root: changesDir, changes: changesDir } as Store["paths"],
    config: null,
    tasks: { show: async () => ({ changeId: "c-12", metadata }) },
  } as unknown as Store;
}

async function withSeeded(
  opts: {
    documents?: Record<string, unknown>;
    testRuns: Record<string, unknown[]>;
    metadata: Record<string, string>;
  },
  run: (store: Store) => Promise<void>,
): Promise<void> {
  const changesDir = mkdtempSync(join(tmpdir(), "det-ck-oracle-"));
  try {
    await seed(changesDir, opts);
    await run(storeFor(changesDir, opts.metadata));
  } finally {
    const { rmSync } = await import("node:fs");
    rmSync(changesDir, { recursive: true, force: true });
  }
}

describe("checkpoint oracle + live revision (ST-12)", () => {
  test("oracle mismatch blocks with RED_AMBIGUOUS", async () => {
    await withSeeded(
      {
        documents: DOC_V1,
        testRuns: infraRuns(computeSpecRevision(DOC_V1)),
        metadata: {
          tdd_intent: "inline",
          red_oracle_class: "assertion_failure",
          red_oracle_signal: "expected 401",
        },
      },
      async (store) => {
        const result = await checkCheckpointTddEvidence(store, {
          taskId: "tk-12",
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/AMBIGUOUS/);
      },
    );
  });

  test("matching oracle passes", async () => {
    await withSeeded(
      {
        documents: DOC_V1,
        testRuns: runsWithRev(computeSpecRevision(DOC_V1)),
        metadata: {
          tdd_intent: "inline",
          red_oracle_class: "assertion_failure",
          red_oracle_signal: "expected 401",
        },
      },
      async (store) => {
        const result = await checkCheckpointTddEvidence(store, {
          taskId: "tk-12",
        });
        expect(result.ok).toBe(true);
      },
    );
  });

  test("documents bump after GREEN turns evidence STALE", async () => {
    await withSeeded(
      {
        documents: DOC_V2,
        testRuns: runsWithRev(computeSpecRevision(DOC_V1)),
        metadata: { tdd_intent: "inline" },
      },
      async (store) => {
        const result = await checkCheckpointTddEvidence(store, {
          taskId: "tk-12",
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/STALE/);
      },
    );
  });

  test("absent documents never produce false STALE", async () => {
    await withSeeded(
      {
        testRuns: runsWithRev("whatever"),
        metadata: { tdd_intent: "inline" },
      },
      async (store) => {
        const result = await checkCheckpointTddEvidence(store, {
          taskId: "tk-12",
        });
        expect(result.ok).toBe(true);
      },
    );
  });
});
