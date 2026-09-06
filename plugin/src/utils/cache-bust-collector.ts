/**
 * Bust collector (ST-15).
 *
 * Bridges host events into the pure attribution core. Two feeds, joined by
 * time in report():
 *   - feedTool: `tool.execute.before/after` (tool name, arg/output bytes,
 *     timestamps, cwd, tool inventory size).
 *   - feedUsage: `session.step.ended` snapshots
 *     (`tokens.{input,cache.read,cache.write}` — the same tap cache-runtime
 *     aggregates; here kept as a bounded series instead of sums).
 *
 * Host-agnostic plain shapes, bounded rings (512), never throws (fail-soft —
 * a collector fault must never break tool execution or session flow).
 */

import {
  detectBusts,
  type AttributionOptions,
  type BustAttribution,
} from "./cache-bust-attribution";

export interface ToolEvent {
  phase: "before" | "after";
  tool?: string;
  /** Epoch ms. Defaults to Date.now() when absent. */
  at?: number;
  /** Call identity for pairing; falls back to tool name. */
  callId?: string;
  args?: unknown;
  output?: unknown;
  dir?: string;
  toolCount?: number;
}

export interface UsageSnapshot {
  /** Epoch ms. Defaults to Date.now() when absent. */
  at?: number;
  newTokens: number;
  cachedTokens: number;
  totalTokens: number;
}

export interface CompletedCall {
  tool: string;
  at: number;
  bytesIn: number;
  bytesOut: number;
  dir?: string;
  toolCount?: number;
}

const RING_LIMIT = 512;
/** Approximation cap: busts only need 50KB+ signals; never stringify MBs. */
const BYTE_MEASURE_CAP = 262_144;

function byteLength(value: unknown): number {
  if (value === undefined || value === null) return 0;
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (!text) return 0;
    return Math.min(text.length, BYTE_MEASURE_CAP);
  } catch {
    return 0;
  }
}

function pendingKey(
  tool: string | undefined,
  callId: string | undefined,
): string | undefined {
  if (callId) return `id:${callId}`;
  if (tool) return `tool:${tool}`;
  return undefined;
}

export interface BustCollector {
  feedTool(event: ToolEvent | null | undefined): void;
  feedUsage(snapshot: UsageSnapshot | null | undefined): void;
  completed(): readonly CompletedCall[];
  snapshots(): readonly Required<UsageSnapshot>[];
  report(options?: AttributionOptions): BustAttribution[];
}

export function createBustCollector(
  options: AttributionOptions = {},
): BustCollector {
  const completed: CompletedCall[] = [];
  const usages: Required<UsageSnapshot>[] = [];
  // Tool inventory observed so far: the host system prompt embeds tool names
  // (SessionSystemPrompt.make(toolNames)), so a first-seen tool means the
  // cacheable prefix changed. Recorded per call; compared across snapshots.
  const seenTools = new Set<string>();
  const pending = new Map<
    string,
    {
      tool: string;
      at: number;
      bytesIn: number;
      dir?: string;
      toolCount?: number;
    }
  >();

  const pushBounded = <T>(list: T[], item: T): void => {
    list.push(item);
    if (list.length > RING_LIMIT) list.splice(0, list.length - RING_LIMIT);
  };

  return {
    feedTool(event) {
      try {
        if (!event || (event.phase !== "before" && event.phase !== "after")) {
          return;
        }
        const at = typeof event.at === "number" ? event.at : Date.now();
        if (event.phase === "before") {
          const key = pendingKey(event.tool, event.callId);
          if (!key || !event.tool) return;
          seenTools.add(event.tool);
          pending.set(key, {
            tool: event.tool,
            at,
            bytesIn: byteLength(event.args),
            dir: event.dir,
            toolCount: event.toolCount ?? seenTools.size,
          });
          if (pending.size > RING_LIMIT) {
            pending.delete(pending.keys().next().value!);
          }
          return;
        }
        const key = pendingKey(event.tool, event.callId);
        const open = key ? pending.get(key) : undefined;
        if (key) pending.delete(key);
        if (!open) return;
        pushBounded(completed, {
          tool: open.tool,
          at,
          bytesIn: open.bytesIn,
          bytesOut: byteLength(event.output),
          dir: event.dir ?? open.dir,
          toolCount: event.toolCount ?? open.toolCount,
        });
      } catch {
        // Fail-soft by contract.
      }
    },
    feedUsage(snapshot) {
      try {
        if (
          !snapshot ||
          ![
            snapshot.newTokens,
            snapshot.cachedTokens,
            snapshot.totalTokens,
          ].every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0)
        ) {
          return;
        }
        pushBounded(usages, {
          at: typeof snapshot.at === "number" ? snapshot.at : Date.now(),
          newTokens: snapshot.newTokens,
          cachedTokens: snapshot.cachedTokens,
          totalTokens: snapshot.totalTokens,
        });
      } catch {
        // Fail-soft by contract.
      }
    },
    completed() {
      return completed;
    },
    snapshots() {
      return usages;
    },
    report(reportOptions) {
      try {
        // Lookahead mapping: steps[j] carries the calls whose output entered
        // snapshot j+1, because the core blames the PREVIOUS step for a drop
        // observed at step j. Recomputed from scratch on every report call,
        // so late snapshots always correct earlier attributions.
        // Cause heuristics compare step START states: assign the carried
        // (window-start) dir/toolCount, then advance the carry with the
        // window's calls — a move/inventory change inside the drop's own
        // window surfaces as prev≠next. Empty windows inherit (they persist).
        let carryDir: string | undefined;
        let carryCount: number | undefined;
        const steps = usages.map((snap, j) => {
          const upper =
            j + 1 < usages.length ? usages[j + 1].at : Number.POSITIVE_INFINITY;
          const window = completed.filter(
            (c) => c.at > snap.at && c.at <= upper,
          );
          const top = window.reduce<CompletedCall | undefined>(
            (best, c) => (!best || c.bytesOut > best.bytesOut ? c : best),
            undefined,
          );
          const last = window[window.length - 1];
          const step = {
            tool: top?.tool ?? last?.tool ?? "unknown-idle",
            bytesIn: top?.bytesIn ?? 0,
            bytesOut: top?.bytesOut ?? 0,
            at: snap.at,
            newTokens: snap.newTokens,
            cachedTokens: snap.cachedTokens,
            totalTokens: snap.totalTokens,
            dir: carryDir,
            toolCount: carryCount,
          };
          if (last?.dir !== undefined) carryDir = last.dir;
          if (last?.toolCount !== undefined) carryCount = last.toolCount;
          return step;
        });
        return detectBusts(steps, { ...options, ...reportOptions });
      } catch {
        return [];
      }
    },
  };
}
