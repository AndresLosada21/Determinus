/**
 * Status Markers Domain Types
 *
 * Terminal UI status markers used in chat output.
 */

// =============================================================================
// Status Markers (for terminal UI)
// =============================================================================

export const STATUS_MARKERS = {
  WORK: "[Determinus:WORK]", // 🟩 Agent actively working
  TOOLING: "[Determinus:TOOLING]", // 🟨 Tool run or sub-agent in flight
  ATTN: "[Determinus:ATTN]", // 🟥 User needed (permission pending, approval, or question)
  IDLE: "[Determinus:IDLE]", // ⬜ Agent idle, no action needed (session start or finished work)
  BLOCKED: "[Determinus:BLOCKED]", // 🟥💀 Doom-loop / stuck / crash
} as const;

export type StatusMarker = keyof typeof STATUS_MARKERS;
