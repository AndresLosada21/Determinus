/**
 * Cache-bust attribution core (ST-15).
 *
 * Pure module: no IO, no store, no host calls. Consumes per-step usage
 * snapshots `{tool, bytesIn, bytesOut, at, newTokens, cachedTokens, ...}`
 * and reports probable busts as `{suspect, evidence, cause}`.
 *
 * Drop rule: a step is a bust when cachedTokens fall strictly more than
 * `dropThreshold` (default 50%) versus the previous step's cachedTokens.
 * Cause ranking (first match wins):
 *   1. `ours(move)` — session directory changed between the steps.
 *   2. `ours(tools)` — tool inventory count changed (definitions reorder the
 *      cacheable prefix; beta: cache-policy tools→system→messages).
 *   3. `host(ttl)` — idle gap beyond `ttlGapMs` (default 4.5min ≈ 5m EPHEMERAL).
 *   4. `ours(output)` — preceding call emitted a uniquely large payload.
 *   5. `unknown` — none of the above (e.g. server eviction, prefix rewrite).
 */

export type BustCause = "ours" | "host" | "unknown";

export interface UsageStep {
  tool: string;
  bytesIn: number;
  bytesOut: number;
  /** Epoch ms when the step completed. */
  at: number;
  newTokens: number;
  cachedTokens: number;
  totalTokens: number;
  /** Session working directory observed at the step. */
  dir?: string;
  /** Tool inventory size observed at the step. */
  toolCount?: number;
}

export interface BustAttribution {
  /** Index into the steps array of the step where the drop was observed. */
  stepIndex: number;
  /** Tool call blamed for the bust (the preceding call). */
  suspect: string;
  cause: BustCause;
  evidence: string[];
  recommendation: string;
}

export interface AttributionOptions {
  /** Strictly-greater drop fraction. @default 0.5 */
  dropThreshold?: number;
  /** Idle gap treated as TTL expiry. @default 270_000 (4.5min) */
  ttlGapMs?: number;
  /** Single payload size treated as uniquely large. @default 50_000 */
  largeOutputBytes?: number;
}

const DEFAULTS: Required<AttributionOptions> = {
  dropThreshold: 0.5,
  ttlGapMs: 270_000,
  largeOutputBytes: 50_000,
};

export function appendStep(
  steps: readonly UsageStep[],
  step: UsageStep,
): UsageStep[] {
  return [...steps, step];
}

function dropFraction(prev: number, next: number): number {
  if (prev <= 0) return 0;
  return (prev - next) / prev;
}

export function detectBusts(
  steps: readonly UsageStep[],
  options: AttributionOptions = {},
): BustAttribution[] {
  const { dropThreshold, ttlGapMs, largeOutputBytes } = {
    ...DEFAULTS,
    ...options,
  };
  const busts: BustAttribution[] = [];
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const next = steps[i];
    if (dropFraction(prev.cachedTokens, next.cachedTokens) <= dropThreshold) {
      continue;
    }
    const suspect = prev.tool;
    const evidence: string[] = [
      `cached ${prev.cachedTokens}→${next.cachedTokens} (-${Math.round(
        dropFraction(prev.cachedTokens, next.cachedTokens) * 100,
      )}%)`,
    ];
    let cause: BustCause = "unknown";
    let recommendation =
      "Narrow the preceding call (bounded reads, quiet flags) and re-observe.";
    if (
      prev.dir !== undefined &&
      next.dir !== undefined &&
      prev.dir !== next.dir
    ) {
      cause = "ours";
      evidence.push(
        `cwd ${prev.dir}→${next.dir} (session_move busts the prefix)`,
      );
      recommendation = "Avoid session_move; pass workdir/target_path per call.";
    } else if (
      prev.toolCount !== undefined &&
      next.toolCount !== undefined &&
      prev.toolCount !== next.toolCount
    ) {
      cause = "ours";
      evidence.push(
        `tool inventory ${prev.toolCount}→${next.toolCount} (definitions reorder the prefix)`,
      );
      recommendation =
        "Stabilize tool registration; avoid dynamic skills mid-session.";
    } else if (next.at - prev.at >= ttlGapMs) {
      cause = "host";
      evidence.push(
        `idle gap ${Math.round((next.at - prev.at) / 1000)}s ≥ TTL window (server expiry, not content)`,
      );
      recommendation = "Keep the loop tight; batch independent calls per turn.";
    } else if (prev.bytesOut >= largeOutputBytes) {
      cause = "ours";
      evidence.push(
        `preceding ${suspect} emitted ${prev.bytesOut} bytes (uniquely large payload)`,
      );
      recommendation =
        "Bound that call's output (first-N, quiet flags, 2>$null) or split it.";
    }
    busts.push({ stepIndex: i, suspect, cause, evidence, recommendation });
  }
  return busts;
}
