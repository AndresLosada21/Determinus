# ADE 6.1.3 - Engineering Admission / Flow-Unblock Fix

ADE 6.1.3 is the release that closes the repeated admission blockers observed on the real Perssua-TS project after the 6.1.1/6.1.2 observability work.

## Real-project finding

The project policy reached `authorized: true` while `checks` remained empty. Every engineering attempt therefore failed before any worker was created, first on authorization and then on one missing deterministic check at a time. That is a runtime/product defect: known safe verifier prerequisites should be prepared as a single bounded admission step, not handed back to the user as a sequence of manual edits.

## Changes

- Engineering admission now auto-provisions three ADE-owned safe presets when requested and locally supported:
  - `tsc-noEmit` -> local TypeScript compiler via trusted `node`, `--noEmit`;
  - `dist-build` -> local TypeScript compiler via trusted `node`, emitting according to project `tsconfig`;
  - `premium-grep-zero` -> ADE builtin bounded `source_absence` scanner over `src/`, with no shell/grep dependency.
- An already-human-authorized project policy authorizes those verifier-owned, non-destructive checks for workflow VERIFY. The kernel no longer interrupts the same engineering workflow for three redundant per-check chat grants.
- Unknown checks, malformed policy, explicit `allow_host_process:false`, unsafe definitions, external mutations, VCS/PR/tracker writes and other high-impact effects remain fail-closed and retain exact-effect grants where applicable.
- Admission reports all policy/check problems together instead of revealing a new prerequisite on each retry.
- `/ade-doctor` now reports execution-policy readiness: authorization, registered checks, auto-provisionable standard checks, and `ready_for_standard_engineering`.
- 6.1.2 parent-linked worker sessions, Task-compatible progress metadata, Observation Plane, fallback/recovery, Git-optional filesystem evidence and inconsistent-VCS fail-closed behavior are retained.
- Orchestrator guidance explicitly treats old journal blockers as history and forbids asking the user to manually register the standard ADE check presets.

## Perssua-TS expected path

With the observed policy (`authorized:true`, `checks:{}`) and the project's installed TypeScript/src tree, a D6 engineering start requesting `tsc-noEmit`, `dist-build`, and `premium-grep-zero` should self-provision the checks and persist the workflow immediately. No Git initialization and no manual JSON check registration should be required.

## Remaining host canary

Parent-visible live worker rendering still depends on the target OpenCode2 TUI. ADE distinguishes event capture from UI delivery and does not claim TUI visibility until observed on the host. This does not block engineering execution.
