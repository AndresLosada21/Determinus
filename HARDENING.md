# Hardening — ADE 6.1.3

ADE 6.1.3 keeps bounded self-healing without self-authorization and hardens the merged observation/Git-optional behavior.

## Recovery classes

- `SAFE_AUTO_REPAIR`: ADE-owned missing policy, known schema-1 omissions, restrictive Docker defaults, legacy process-runner normalization, and missing ADE-managed agent registrations.
- `HUMAN_GATE`: policy authorization, unknown/ad-hoc check definitions, network, workspace writes, remote/VCS effects, standalone high-impact executions, and explicit deny reversal.
- `FAIL_CLOSED`: malformed JSON, unsupported schema, ambiguous definitions, secrets, path-boundary violations, inconsistent VCS, unsafe kernel store, or unknown state.

## Observation hardening

Observation data is non-authoritative and separately bounded. Raw child session IDs are replaced by hashed refs on public surfaces. Secrets are redacted. Model reasoning text is never projected from `session.reasoning.delta`; only a generic activity event may be emitted.

Event-stream failure cannot grant capabilities, alter a lease, consume an authorization grant, or mark a job successful. A broken stream degrades to polling/heartbeat.

## Git-optional hardening

“No repository” and “inconsistent repository” are distinct states. Only the former can use filesystem mode. The latter blocks before token spend.

Filesystem mode writes only paths plus fingerprints/metadata to the external kernel store. It does not copy source contents into the journal. Symlinks are not followed, common dependency/cache trees are ignored, and file/hash work is bounded. A pre-BUILD baseline is mandatory and is reused during crash recovery; BUILD cannot silently resume without it.

## Lock recovery

External file locks include owner PID/token. A lock whose owner process is dead can be reclaimed immediately. A live owner is never preempted merely because the lock is old.

## Standard verifier preset hardening

The three standard engineering presets are narrow ADE definitions, not arbitrary project commands. TypeScript gates execute the project-local compiler through a trusted host `node` executable. `premium-grep-zero` is an internal bounded scanner and never invokes a shell. Existing user check definitions are never silently replaced; explicit vetoes remain authoritative. Workflow VERIFY snapshots the check definition and revalidates it immediately before execution to prevent definition TOCTOU.
