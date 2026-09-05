/**
 * Spec-revision binding (ST-09/ST-12).
 *
 * Single source for hashing workflow documents into a short revision id.
 * Writers (`determinus_run_test`) stamp it on every run; readers
 * (`checkCheckpointTddEvidence`) recompute it from live documents so a spec
 * bump after GREEN turns prior evidence STALE. Stable for absent documents
 * (no false STALE on legacy changes).
 */

import { createHash } from "node:crypto";

export function computeSpecRevision(
  documents: Record<string, unknown> | undefined,
): string {
  const payload = JSON.stringify(documents ?? {});
  return createHash("sha256").update(payload).digest("hex").slice(0, 12);
}
