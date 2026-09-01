# ADV - Spec-Driven Development Instructions

Specs are laws. Requirements are formally defined, validated, and enforced.

## Notation

`→` sequence · `←` blocked by · `✓` complete · `○` pending · `×` forbidden · `⚠` attention

### Instruction Compression Guard

Use `docs/command-voice-standard.md` prose-load templates + the global ASD-STE100 voice contract wording. Exact contract tokens stay unchanged: tool names, gate IDs, statuses, slash commands, enum values, quoted errors, `MUST`, `NEVER`, approval checkpoints, cancellation approval, archive sign-off, JSON/code examples.

## Core Decision Rules

| When                               | Then                                   |
| ---------------------------------- | -------------------------------------- |
| Spec conflicts with proposal       | Spec wins                              |
| Gate incomplete                    | Archive blocked                        |
| 3 failed task attempts             | Stop → `[ADV:BLOCKED]` → escalate      |
| Cross-repo task                    | Execute in target repo via `workdir`   |
| User requests cancellation         | Require approval via `determinus_task_cancel` |
| TDD required + trivial task        | Mark trivial with reason, skip TDD     |
| User requests skip + gate required | `[ADV:ATTN]` → ask for sign-off        |

## HITL Boundary Model

Per-phase collaboration mode. Planning gate machine-enforced via `determinus_gate_complete` (`userApproved: true`); other modes are agent self-enforced.

**Agent-side gap:** Only planning is machine-enforced. Other phase boundaries rely on command-doc adherence.

| Phase           | Mode                         | Detail                                                                                                                                                                                |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/determinus-idea`     | Collaborative                | Fully collaborative; ideation loop before a proposal exists                                                                                                                           |
| `/determinus-problem`  | Collaborative                | Fully collaborative; issue triage before deciding fix path. Defect-origin work produces a Root Cause Analysis (RCA) that downstream `/determinus-proposal` and `/determinus-task` invocations MUST carry forward (rq-defectOriginRca01). RCA shape mirrors `/determinus-problem` output; bypass rationale must be explicit if `/determinus-problem` was not used.
| `/determinus-epic`     | Collaborative                | Fully collaborative; goal-first Epic creation with final confirmation before typed Epic mutation                                                                                       |
| `/determinus-backlog`  | Collaborative                | Capture future work as backlog-status changes before proposal; typed-tool mutation after confirmation                                                                                        |
| `/determinus-coordinate` | Collaborative              | Fully collaborative; Epic coordination report with explicit approval before typed Epic mutation                                                                                        |
| `/determinus-proposal` | Collaborative                | Fully collaborative; approve at end                                                                                                                                                   |
| `/determinus-research` | Collaborative                | Fully collaborative; approve at end                                                                                                                                                   |
| `/determinus-prep`     | HITL hard gate               | Vision document → explicit user approval → `userApproved: true` on prep gate                                                                                                          |
| `/determinus-apply`    | Autonomous                   | No "Begin work" prompt; proceeds after prep approval. Escalate only on failure                                                                                                        |
| `/determinus-review`   | Autonomous + drift detection | Auto-fix within scope; stop on drift                                                                                                                                                  |
| `/determinus-harden`   | Autonomous + drift detection | Auto-fix scoped issues; stop on drift                                                                                                                                                 |
| `/determinus-archive`  | Autonomous                   | Apply spec deltas, capture wisdom, finalize git                                                                                                                                       |

### Drift Detection Rule

In autonomous phases (`/determinus-review`, `/determinus-harden`), before auto-remediating ask: "Will `agreement.md`'s **Success Criteria**, **Acceptance Criteria**, **Constraints**, **Avoidances**, or **Out of Scope** sections need to change?"

| Answer | Action                                                    |
| ------ | --------------------------------------------------------- |
| YES    | STOP. Present finding via `question` tool (`[ADV:ATTN]`). |
| NO     | Auto-remediate within scope.                              |

### Prep Gate Machine Enforcement

`determinus_gate_complete gateId: 'planning'` requires `userApproved: true`. Without it, the gate returns an error. Only machine-enforced HITL gate.

### Human Checkpoints (Pause Required)

ADV pauses ONLY at these checkpoints:

- Proposal confirmation — user confirms problem statement
- Agreement sign-off — user approves objectives and acceptance criteria
- Design approval — ONLY when real tradeoffs depend on user values or product vision, OR when the design validator returns CONFLICT, OR when the agent identifies contract-compromise risk (rq-designval04)
- Prep approval — user approves vision doc and task graph (machine-enforced: `userApproved: true` required)
- Acceptance — user confirms delivered work satisfies the agreement
- Archive sign-off — user approves final release
- Cancellation approval — explicit user approval required
- Doom-loop recovery — user guidance required after 3 failed attempts

**Approval surface:** Human checkpoints listed above MUST use inline handoff text per `docs/command-voice-standard.md` § Inline Approval Voice — NOT the `question` tool. Spec ref: `rq-inlineApproval01`. Doom-loop recovery uses `question` tool (safety-critical structured choices).

| Tier             | Checkpoints                                   | Parser                          |
| ---------------- | --------------------------------------------- | ------------------------------- |
| A (reversible)   | proposal, agreement, design, prep, acceptance | whitelist + LLM fallback        |
| B (irreversible) | archive sign-off, cancellation                | whitelist-only, NO LLM fallback |

Archive sign-off executes inline in the same response as the whitelist match — no separate confirmation-echo turn.

### Post-Approval Auto-Continue

Tier A whitelist reply (continue, go, approve, yes, ok, proceed, accept, lgtm, etc.) → next phase begins inline immediately. No "shall I proceed?", no second confirmation. Slash-command replies (`/determinus-X`) are no-ops; OpenCode dispatches them to fresh sessions.

### Between-Checkpoint Flow

Only system-level interrupts cause pauses between checkpoints:

| Interrupt                     | Trigger                                     |
| ----------------------------- | ------------------------------------------- |
| Doom-loop                     | 3 failed task attempts                      |
| Drift detection               | auto-fix boundary exceeded in review/harden |
| Contract-compromise risk      | identified during design                    |
| Design validator `CONFLICT`   | verdict requires user resolution            |
| Prep gate machine enforcement | `userApproved` required                     |

No other pauses or "shall I continue?" prompts permitted.

## Phase Goals

Each workflow command has a defined phase goal. Canonical in `manifest.ts` (`phaseGoal` field on `CommandDef`). Self-check: "Am I still working toward this phase's goal?"

| Phase           | Goal                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/determinus-proposal` | Clarify the problem, user needs, and high-level user outcomes. Establish _what_ and _why_ — no _how_.                         |
| `/determinus-research` | Produce a defined, fully-researched proposed plan ready for user approval. Validate the _how_.                                |
| `/determinus-discover` | Gather current-state evidence, resolve agreement, and capture objectives and acceptance criteria before design. Runs an always-on completeness verification (Phase 1.8) — see `rq-disc13`/`rq-disc14` in the determinus-discover spec.               |
| `/determinus-design`   | Convert the approved agreement into a validated implementation strategy ready for planning.                                   |
| `/determinus-prep`     | Complete the flight-check: every gap closed, every dependency mapped, every task ready — ready for autonomous implementation. |
| `/determinus-apply`    | Execute the approved plan autonomously. Add discovered tasks within scope. Escalate only on failure.                          |
| `/determinus-review`   | Verify implementation matches the approved plan. Auto-fix within scope. Stop on drift.                                        |
| `/determinus-harden`   | Verify production-readiness. Auto-fix scoped issues. Stop on drift.                                                           |
| `/determinus-archive`  | Promote the change from contract to law: apply spec deltas, capture wisdom, clean up.                                         |
| `/determinus-reflect`  | Synthesize post-completion learnings into a durable reflection artifact for process improvement.                              |

## Commands

### Core Workflow

| Command                     | Purpose                                                                          |
| --------------------------- | -------------------------------------------------------------------------------- |
| `/determinus-idea`                 | Explore rough ideas before drafting a proposal                                   |
| `/determinus-problem`              | Triage defects and unintended behavior before fixing or drafting a proposal        |
| `/determinus-status`               | Show fast ADV status table                                                       |
| `/determinus-roadmap`              | Show fast ADV roadmap table                                                      |
| `/determinus-epic`                 | Gather Epic goals before typed creation                                          |
| `/determinus-backlog`              | Capture future work as backlog-status changes before proposal                          |
| `/determinus-proposal <summary>`   | Extract problem statement, user outcomes, and constraints without creating tasks |
| `/determinus-validate <change-id>` | Validate change compliance against specs; block archive on failure               |
| `/determinus-apply <change-id>`    | Implement change with TDD, retry on failure, and final verification              |
| `/determinus-archive <change-id>`  | Archive completed change: apply spec deltas and finalize git                     |
| `/determinus-reflect <change-id>`  | Produce a structured two-plane reflection report for an archived change          |

### Pre-Implementation

| Command                     | Purpose                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/determinus-clarify`              | Ask clarifying questions to resolve ambiguous requirements                                           |
| `/determinus-research <target>`    | Produce a defined, fully-researched proposed plan ready for user approval                            |
| `/determinus-discover <change-id>` | Gather context, analyze current state, identify objectives, and obtain user agreement                |
| `/determinus-design <change-id>`   | Validate architecture decisions, produce implementation strategy, and present design for user review |
| `/determinus-prep <change-id>`     | Analyze gaps and synthesize tasks from approved agreement plus validated design                      |

### Post-Implementation

| Command                   | Purpose                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `/determinus-review <change-id>` | Review code for correctness, security, and architecture; emit REVIEW_FINDINGS           |
| `/determinus-harden <change-id>` | Detect low-quality code, verify test coverage, clean up; block archive on open findings |
| `/determinus-audit [capability]` | Detect drift between specs and current implementation                                   |
| `/determinus-slop-scan [path]`   | Scan slop, deletion safety, and detector coverage                                       |
| `/determinus-arch-scan [path]`   | Scan architecture stack packs, coverage, and heuristic fallbacks                        |
| `/determinus-comp-scan <target>` | Scan competitor capabilities against this project for competitive intelligence          |

### Fast-Track / Determinusd

| Command                     | Purpose                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/determinus-task`                 | Fast-track small changes: assess spec-law impact, prep, and hand off                                 |
| `/determinus-refactor [change-id]` | Refresh a stale proposal or batch-refresh the oldest 30% of active changes                           |
| `/determinus-cleanup`              | Triage stale changes, drifted worktrees, merged branches, and state leaks; delete approved candidates |
| `/determinus-coordinate`           | Audit project changes, Epic alignment, sequencing, and membership health; includes Epic-unlinked in-flight changes                             |
| `/determinus-triage`               | Triage sources, coalesce issue links, assign bug priority, and balance portfolio |
| `/determinus-improve`              | Analyze improvements across existing specs, implementation, and external landscape                    |
| `/determinus-tron [target]`        | Investigate codebase structure, hotspots, risks, and suggest follow-up candidates             |
| `/determinus-optimizer [target]`   | Analyze code simplification opportunities and propose optimizer changes                              |

## Command Boundaries

| Command  | Produces                                                                                                                             | × MUST NOT                                                               | Gate                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------- |
| proposal | Problem statement, User Outcomes, constraints                                                                                        | Create tasks, complete gates, impl decisions                             | proposal                                 |
| discover | Current-state evidence, objectives, agreement, acceptance criteria                                                                   | Create tasks, complete non-discovery gates                               | discovery                                |
| design   | Validated implementation strategy                                                                                                    | Create tasks, bypass validator                                           | design                                   |
| prep     | Task graph, gap analysis, sequencing                                                                                                 | Complete non-planning gates, architecture decisions                      | planning                                 |
| task     | Change + tasks + gates (tracked fast path; includes spec-law impact assessment and crash recovery through durable change/task state) | Skip spec-law Add/Modify/Remove/No update/Uncertain assessment           | proposal + discovery + design + planning |
| apply    | Implementation via TDD                                                                                                               | Auto-complete discovery/planning gates                                   | execution                                |
| review   | Review findings and acceptance evidence                                                                                              | Archive, release, or expand scope silently                               | acceptance                               |
| archive  | Spec promotion, release readiness, cleanup                                                                                           | Skip validation, conformance, or sign-off                                | release                                  |
| reflect  | Reflection report (JSON + Markdown), friction analysis, improvement suggestions                                                      | Mutate change state, tasks, or gates; block archive when invoked from it | None                                     |

- Only `/determinus-prep` (and exempt `/determinus-task`) may call `determinus_task_add`
- `/determinus-apply` stops if discovery or planning gates pending
- Deployment is outside ADV's gate lifecycle — ADV stops at push. Post-release deploy is a separate, user-initiated step
- Commands that own boundary-sensitive workflow steps should include `## Command Boundary` details

### Large Non-Code Deliverable Routing

Large non-code deliverables — for example **market research, design improvement, competitive research, writing, analysis/planning** — MUST route to a tracked ADV change after any optional pre-change research clarifies direction, unless the user explicitly scopes the work as **one-off/read-only**.

`/determinus-improve` and `/determinus-research` are read-only pre-proposal research commands. They may produce `docs/*-prep.md` evidence packs consumed by `/determinus-proposal` or `/determinus-discover`, but they MUST NOT replace the tracked workflow for consequential deliverables or mutate ADV change/task/gate state.

## Status Markers

Emit at START of each response:

| Marker                     | When                                                          | Emoji |
| -------------------------- | ------------------------------------------------------------- | ----- |
| `[ADV:WORK]`               | Agent actively working                                        | 🟩    |
| `[ADV:TOOLING]`            | Tool run or sub-agent in flight                               | 🟨    |
| `[ADV:ATTN]`               | User needed (permission pending, approval, or question)       | 🟥    |
| `[ADV:IDLE]`               | Agent idle, no action needed (session start or finished work) | ⬜    |
| `[ADV:BLOCKED]`            | Doom-loop / stuck / crash                                     | 🟥💀  |
| `[ADV:TASK_STATUS_REPORT]` | Task report                                                   | —     |
| `[ADV:SKILL_CREATED]`      | Auto-created skill persisted (skill name, domain)             | 🟦    |
| `[ADV:REFLECTION]`         | Reflection report emitted                                     | 🟪    |
| `[ADV:PEER_SESSIONS]`      | Informational; peer sessions detected in same project         | ⬜    |

Tab title: active ADV change identity only. With an active change the title is exactly the change ID; with Epic membership it is `epicId | changeId`. With no reachable active change, ADV emits no title write and the pane retains its last intentional title. No project fallback, no dynamic status/progress retitles. System-emitted: `[ADV:ACCUMULATED_WISDOM]`, `[ADV:TODO_CONTINUATION]`, `[ADV:RECORD_WISDOM]`

### Context Snapshot

`_contextSnapshot` — compact summary closing the context agreement gap:

- Change ID/title, gate progress (`[✓ proposal] [○ execution] ...`), task counts, current task, workdir

Emitted by mutation/ticker tools (`determinus_change_create`, `determinus_change_reenter`, `determinus_gate_complete`, `determinus_task_update`, `determinus_task_ready`, `determinus_task_add`, `determinus_task_cancel`, `determinus_wisdom_add`) only when the caller passes `include.snapshot:true`. When omitted (default), no snapshot is emitted. `determinus_change_show include: { snapshot: true }` also returns `_contextSnapshot` on request. `determinus_status` recommendation-list snapshots follow `rq-ctxticker2.5` (unchanged — advisory multi-change display, MCP-contract-bound).

**Cross-Repo Switch** — emit via `formatCrossRepoSwitch()`.

## Critical Protocols

### Resume Freshness Advisory (Step 2.5)

When the agent loads state for a resumed change at Step 2 and the change's `lastActivityAgeMinutes > 60`, surface a bounded Resume Freshness advisory before proceeding to Step 3 Gate Machine.

**Stable finding codes** (no LLM-classified labels):

- `resume:sibling_overlap` — active sibling change touches same capability/paths
- `resume:archived_duplicate` — archive shipped since `lastActivityAt` overlaps scope
- `resume:codebase_drift` — commits to task-referenced files since `lastActivityAt`
- `resume:freshness_limited` — could not reach a conclusion (missing/stale evidence or budget exceeded)

Each finding carries a label from `/determinus-coordinate`'s inherited taxonomy: `repo_backed_fact` (HIGH), `determinus_backed_fact` (HIGH), `judgment_call` (MEDIUM), or `freshness_limited` (no conclusion).

**Contract:**

- Informational with proceed-default — agent proceeds unless user objects; advisory does NOT block gate transitions.
- Read-only — no ADV state mutation from the advisory itself.
- Current-project scope only — cross-project fan-out remains `/determinus-coordinate` ownership.
- No dismissal memory — findings re-raise on every stale resume.
- Fresh changes (`lastActivityAgeMinutes ≤ 60`) skip the advisory entirely.
- Spec law: `rq-resumeFreshness01` under `advance-workflow`.

**Single HIGH-confidence `resume:archived_duplicate` action:** surface a copy-pasteable `determinus_change_close ... supersededBy: <current>` snippet. User must run explicitly with their own approval evidence. **ADV does not auto-execute close.** Wording: "one-command accept (copy-paste and run)" — never "one-click" or any phrasing implying button-click auto-execution.

**Session hygiene — one session per major change.** Prefer a fresh OpenCode session for each major change rather than chaining multiple `/determinus-archive` cycles in one long-lived session. Long sessions accumulate large tool outputs and diffs; ADV compacts any prompt entry over the size threshold and surfaces a one-shot `[ADV:SESSION_HEALTH]` banner (`message-history` kind) warning that prior chat history is truncated and not a source of truth. The banner is informational (fires once per compaction event), but its appearance is the signal to start fresh and resume by `changeId` — durable ADV state (changes, tasks, gates, contracts) is the source of truth, not chat scrollback.


### MCP Tool Name Contract

External MCP invocation follows the active-surface contract carried by each MCP-capable agent prompt: use only capabilities actually exposed in the session — through the generated catalog when `execute` is exposed, direct callables otherwise — and never normalize identifiers. Name providers and capabilities in workflow prose (Context7 for library docs, Exa for web discovery, searchcode for public-repo code, Firecrawl for page scrape/crawl, lgrep for local code intelligence, Vision for daemon status, adv for the ADV project's own Tier-4 read surface); take exact invocation spellings from the active schema or catalog at runtime. The `adv` MCP server is the ADV project's own server (Vision `determinus-advance`, port 6298) and exposes a Tier-4 read surface reachable as `tools.adv.<tool>` under Code Mode.

### Structural Correctness (P33)

Make correctness structural before heuristic: prefer types, schemas, parsers, state machines, invariants, contracts, database constraints, generated validators, and tests. Fully recognize/normalize untrusted input before processing.

| Area                      | Structural owner                                                                                                       | Heuristic allowed only for                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Gates/tasks/backlog/specs | `determinus_gate_*`, tasks, `metadata.tdd_intent`, validators, specs, conformance, exact refs, typed fields, user assignments | discovery, ranking, triage hints, legacy fallback, advisory risks |

Heuristics MUST NOT be sole authority for correctness, security, persistence, workflow state, gate completion, or spec compliance. If unavoidable: isolate, document assumptions, add deterministic guardrails, test edge cases/properties.

### Truth Ordering Cascade

When artifacts conflict, later gates override earlier gates. Spec requirements override all artifacts.

| Priority | Source | Authority |
|----------|--------|-----------|
| 1 (highest) | `.adv/specs/*.md` | Spec laws — immutable until spec delta archived |
| 2 | `agreement.md` | Confirmed objectives, AC, constraints, avoidances |
| 3 | `design.md` | Validated architecture decisions |
| 4 | `proposal.md` | Problem statement, scope, user outcomes |
| 5 (lowest) | Conversation | Current session context |

**Conflict resolution:** If `proposal.md` says X but `agreement.md` says Y, follow Y. If `agreement.md` conflicts with a spec requirement, follow the spec. Gate sequence enforces this ordering structurally — later gates cannot complete without prior gates done.

**Non-blocking warnings:** Gate readiness may emit advisory warnings when artifact conflicts are detected. These do not block gate completion but surface potential drift for agent awareness.

### ADV State Access

× NEVER read ADV state files directly (`read`, `cat`, `ls`). Use ADV MCP tools exclusively.

Forbidden: `~/.local/share/opencode/plugins/advance/**/{change.json,proposal.md,problem-statement.md,wisdom.jsonl,conformance.json}` and legacy `agenda.jsonl` files.

| Need                     | Tool                                                      |
| ------------------------ | --------------------------------------------------------- |
| Change + tasks           | `determinus_change_show`                                         |
| Update proposal          | `determinus_change_update` (× never re-call `determinus_change_create`) |
| Specific task + changeId | `determinus_task_show`                                           |
| Ready tasks              | `determinus_task_ready`                                          |
| All tasks                | `determinus_task_list`                                           |
| Active changes           | `determinus_change_list`                                         |
| Validate                 | `determinus_change_show validate: true`                          |
| Wisdom                   | `determinus_wisdom_list`                                         |

On direct-read failure → stop, call `determinus_change_show` or `determinus_task_show`.

### Multi-Session Coordination

Multi-session is the supported design center. Per-change filesystem advisory locks (acquired inside `commitChangeProjection`) serialize ADV state writes; per-worktree git isolation eliminates working-tree races.

**Operational model:**

- Each mutating execution session owns its own worktree; read-only/status sessions may run from the main checkout.
- ADV change mutations are serialized by per-change filesystem advisory locks acquired inside `commitChangeProjection` (15s budget, jittered exponential backoff, stale-PID reclaim). A lock timeout fails closed as `operator_required`. Mutations to DIFFERENT changes are unconstrained — they touch disjoint files. Cross-session `git worktree add/remove` is serialized separately by a kernel `git-worktree.lock` under the repository's canonical `git-common-dir/advance` administrative state (1.5s retry budget); it never lives in a checkout or `.adv`.
- Git filesystem ops (`git worktree add/remove`) coordinate via narrow per-repo flock (~50ms hold)
- determinus-managed worktree paths are tool-owned. Agents must not invent repo-specific
  directories such as `~/dev/<repo>-wt` for ADV changes. Use
  `determinus_worktree_create resume: true` and then use the returned
  `workdir`. The canonical path shape is
  `$determinus_WORKTREE_HOME/{project-id}/{branch}` when `determinus_WORKTREE_HOME` is set,
  otherwise `$XDG_DATA_HOME/opencode/worktree/{project-id}/{branch}`.

**Plugin behavior:** At init, the plugin scans peer `opencode` processes sharing project (`git rev-parse --git-common-dir` OR ADV project-id). Peer found → emits `[ADV:PEER_SESSIONS] N peer session(s) active in this project.` Informational only; peers supported.

Peer-session visibility (`determinus_status`, `determinus_change_show include:{sessions:true}`) assumes same project = same trust domain. Multi-developer / shared-CI scenarios are out of scope; revisit via separate change if needed. The defensive opaque `session_id` schema (no PID, no full path in public output) mitigates leak risk.

**Useful tools:**

- `determinus_status` — Peer Sessions section (session_id + started_at + worktree-basename)
- `determinus_change_show include:{sessions:true}` — list peer sessions in same project
- `bin/adv doctor` — peer count, worker-lock holder PID, change workflow presence, and automatic safe-fix/verify
- Stability: `determinus_status view:"health"` shows worker_singleton_enforce default false; worktree_guard_enforce default true (post-rollout, rq-autoManageAdvWorktrees AC2); `worker_role` = `host`/`client`/`degraded`; opt-in: explicit true or `determinus_FORCE_IN_PROCESS_WORKER=1`.
- Worktree guard: trunk write firewall enforcement is default-on. `worktree_guard_enforce` omitted or true enables strict blocking. Explicit `worktree_guard_enforce: false` is the legacy escape hatch — pre-flip behavior was "omitted or false allows default-checkout file writes and classified destructive bash writes". `worktree_guard_enforce=true` blocks main-checkout writes with `WorktreeIsolationViolation` + remediation. Determinus repo opts into strict mode by default (no explicit project.json override needed). Auto-managed changes (per-change `worktree_auto_managed: true` marker) override the global flag and always engage the guard. Existing-worktree exception: when a setup-ready ADV worktree already exists for the change, guarded gate/task state-transition mutations from the main checkout are ALLOWED regardless of the `worktree_auto_managed` marker (existing-worktree detection over the durable change-workflow `worktrees` map is the structural authority; the marker is a fast-path hint). File-write isolation (checkpoints/edits) is unchanged; the ALLOW is scoped to durable state-transition signals only.
- Health probes: `_freshness.{probe}` = `cached_at`, `stale`, optional `error`. Stale values are diagnostic-only; never use stale probe data for worker-lock reclaim, restart success, conformance override, or archive.

**Known OpenCode-core race (out of ADV's layer):** OpenCode's snapshot service is keyed on `projectID`, not on worktree path. Two sessions on the same project — even in different worktrees — race on `~/.local/share/opencode/snapshot/{projectID}/{sha}/index.lock` and lose between-turn snapshots with `exitCode=128 ... 'index.lock': File exists`. ADV's task-checkpoint commits (separate git ops in the worktree) are unaffected, but OpenCode's snapshot history develops gaps. Tracked in Determinus issue #118 — fix is OpenCode-core, not ADV. The "Multi-session is the supported design center" claim above applies to **ADV state and per-worktree git**, not to OpenCode's snapshot subsystem.

### ADV MCP Tool Invocation

× NEVER invoke ADV tools with empty parameter sets. Always provide all required args explicitly.

- `determinus_change_update` — always pass `changeId` + at least one of `proposal`, `problemStatement`, `agreement`, `design`, `executiveSummary`. Zero-args calls hit a 10s safety-net timeout and return `errorClass: ToolExecutionTimeout`. Confirm the target with `determinus_change_show` or `determinus_change_list` first.
- `determinus_task_add` — before passing `blockedBy`, call `determinus_task_list changeId: <id>` to fetch current task IDs. Unknown IDs are rejected with the list of valid IDs so you can self-correct, but this costs a round trip.
- `determinus_task_add` — `metadata.tdd_intent` defaults to `"inline"` when omitted. Pass it explicitly for `"separate_verification"` (cross-cutting verify tasks) or `"not_applicable"` (docs/config/verification-only tasks). The validator's logic-heavy heuristic flags missing TDD evidence on tasks defaulted to `inline` regardless of content prose; set explicit metadata at creation time. <!-- rq-TDD002sep rq-TDD003na -->
- `determinus_task_cancel` — all `taskIds` must exist in the same change. Cancellations are atomic: if any ID is unknown, NO task is cancelled. Verify with `determinus_task_list` before calling.
- `determinus_change_archive` — when archiving from a worktree, pass `worktreePath: <worktree-root>` so the in-repo bundle lands inside the worktree's `.adv/archive/` (where `/determinus-archive` Phase 9 Step 1 stages it on the change branch). Omitting the arg defaults to `store.paths.root` (main checkout) and the bundle ends up untracked in main, requiring a separate trunk commit.
- `determinus_run_test` — pass `timeoutMs` (range `[1000, 300_000]` ms, default `30_000`) for slow commands like `pnpm run check` or full suites. Without it, commands taking >30s SIGTERM and the tool returns `errorClass: TestExecutionTimeout`.
- `determinus_gate_complete` — planning gate requires `userApproved: true`. Other gates accept the flag but only planning enforces it.
- Tool `describe()` text documents relational constraints (which other tool to call first, at-least-one-of patterns, valid enum values). Read field descriptions before constructing calls.

#### Tier-4 MCP read surface (`tools.adv.*`)

Under OpenCode Code Mode (default for `oc`-launched sessions), the 13 Tier-4 read tools are also reachable as `tools.adv.<tool>` inside the `execute` tool — for example, `tools.adv.status({ ... })`. This is the same ADV MCP server surfaced differently; `determinus_handshake` probes the inventory and contract version. Prefer the `tools.adv.*` path for pure reads when already operating inside `execute`; use the host-plugin `determinus_*` tools when `execute` is not exposed.

**Strict-mode tolerance.** OpenAI Responses API (GPT-5 / reasoning models) auto-applies `strict: true`, causing placeholder fills (`""`, `0`, `[]`) in every optional field. Preflight normalizes these automatically: optional content, path, and lineage blanks are omitted, and `origin_issue_number: 0` is treated as omitted. Required-when-present audit, evidence, reason, command, branch, and identity fields still reject blanks. This is a safety-net workaround for Vercel AI SDK issue #12200. Agents should still aim to omit fields they do not intend to set.

### Question Tool UX

Write-in option enforced by P26 (`rules.yaml`). ADV notes:

- Contextual write-in labels (`Other`, `Different approach`) — not generic
- 2-5 options including write-in, concise labels
- Leave custom input enabled

**Note convention:** Optionally append a synthetic trailing question with header `"Note for agent"` to give users a free-form context slot. Positional parsing extracts the note from the last answers-array element. Normalizes empty/`"No note"`/missing → absent. Max 4 real questions + 1 note = 5 total. See `docs/determinus-question-tool.md` § Note for Agent Convention for full rules. **Non-checkpoint only** — never add to human checkpoint surfaces (`rq-inlineApproval01`).

**Scope of question tool use:** Reserved for non-checkpoint structured choices: change-id selection / disambiguation, doom-loop recovery, drift detection in `/determinus-review` and `/determinus-harden`, AC clarification rounds (Phase 4.5 of `/determinus-discover`), and triage commands (`/determinus-idea`, `/determinus-problem`, `/determinus-clarify`). Human checkpoints listed above use inline handoff text per `docs/command-voice-standard.md` § Inline Approval Voice and `rq-inlineApproval01`.

### Tradeoff Prioritizer Protocol

When 2+ viable approaches depend on user values → run the prioritizer protocol before asking.

**Default (inline):** Scan code → research tradeoffs → draft criteria questions → pass to `question` tool → restate priorities → recommend.

**Optional (skill):** Load `skill("prioritizer")` for structured criteria question templates and decision map guidance. The prioritizer is a skill/inline protocol, not a spawnable sub-agent.

Skip for: bug fixes, mechanical work, choices constrained by security/API/architecture.

### Context Freshness

Phase start (once): prefer the augmented form
`determinus_change_show changeId: <id> include: { snapshot: true, readyTasks: true }` —
this single call collapses the legacy trio
(`determinus_change_show + determinus_gate_status + determinus_task_ready`) into one round trip:

| Flag                                | Attached field                                                               | Replaces                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `include.snapshot: true`            | `_contextSnapshot` (top-level rendered string)                               | `determinus_change_show` proposal/gate-row reading + manual reconstruction |
| `include.readyTasks: true`          | `_readyTasks` (top-N) + `_readyTasksMeta` (`{ total, limit, blockedCount }`) | `determinus_task_ready changeId: <id>`                                     |
| `include.readyTasksLimit: N` (1-50) | overrides default top-10 slice                                               | —                                                                   |

Default behavior is preserved when `include` is omitted (legacy callers and read-only inspections continue to work unchanged).

Per task: `determinus_task_show` → refresh only the current task. Do NOT call determinus_change_show before every task — use the lighter per-task refresh.

TodoWrite during ADV execution is a projection over ADV tasks: copy `_todoProjection` rows (`tk-abc123 — title`). Entries without `tk-*` IDs are scratchpad-only/warning-first; non-ADV, early-gate, degraded-state, and subagent scratchpad use remains allowed.

### TDD Protocol (RSTC)

#### Proof Selection

Select proof from the typed task contract, in this order: deliverable/type, normalized `evidence_policy` + `proof_target`, then `metadata.tdd_intent`. A valid non-test evidence route for non-code work (for example `source_citation`, `artifact_reference`, `rubric_review`, or `stakeholder_acceptance`) does **not** require `determinus_run_test` or red/green evidence. Task titles, generic agent prose, and a desire for more coverage are advisory; none creates a test requirement.

Behavior-bearing inline code retains TDD: it requires red/green evidence for the behavior being changed. `separate_verification` follows its declared test, review, or static-check plan. Do not substitute a title heuristic for a typed evidence plan.

Inline TDD is default for behavior-bearing inline code — red/green phases WITHIN each task. × Do NOT create separate test tasks for same scope.

- **RED:** Write failing test using editing tool (`edit` / `write` / `morph_edit`) → run with `determinus_run_test phase:'red'` → show failure evidence
- **GREEN:** Implement using editing tool → run with `determinus_run_test phase:'green'` → if fails: retry protocol → show pass evidence
- **VERIFY:** Optional final check → run with `determinus_run_test phase:'verify'` → show pass/fail evidence
- **Trivial:** Note `(trivial: docs change)`, skip TDD
- **Cross-cutting:** Separate verification tasks OK → mark `metadata.tdd_intent: "separate_verification"`

`determinus_run_test phase` is descriptive metadata, not gate enforcement. Use `passed`, `classification`, and `exitCode` as command-result evidence. The red→green sequence IS structurally enforced by rq-TDD009seq: include `lastRedRunId` and `lastGreenRunId` (from `determinus_run_test` output `runId`) in `determinus_task_checkpoint` verification for inline TDD tasks. Tasks without these refs are grandfathered (backward compatible). Advisory quality signals (`assertionDensity`, `mockSurface`, `behaviorSurface`) are surfaced for `/determinus-review`; they never gate task completion.

`determinus_run_test` is prescribed for ordinary inline red/green work because it provides executable proof for the current agent run. Use it for selected test execution; a selected static-check route records its command and result as proof without a test run ID. Do not manufacture a test run for a valid non-test route. Durable final proof is recorded on `taskCompletedSignal.verification` when the task transitions to `done` via `determinus_task_checkpoint`. <!-- rq-ADVEXEC04 rq-ADVEXEC05 -->

### Reflection Protocol

Post-completion two-plane analysis for every archived change. Tool: `determinus_reflect`. Persisted in `reflections.jsonl` in ADV state directory.

| Aspect                      | Detail                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| Plane 1 — Project Execution | Efficiency, quality, process adherence, wisdom captured                                       |
| Plane 2 — System Friction   | Tool gaps, workarounds, missing capabilities, doc gaps, UX friction, provider-specific issues |
| Triggers                    | Auto during archive/release flow; manual via `/determinus-reflect <change-id>`                       |
| Audience                    | Informational — human review; does NOT trigger autonomous process modification                |
| Retrieval                   | `determinus_change_show` for archived changes                                                        |

### Task Checkpoint Commits

Every `/determinus-apply` task with file changes in its workdir MUST produce a git commit via `determinus_task_checkpoint` before transitioning to `status:'done'`. Cancellations MUST checkpoint before `status:'cancelled'`. Enforcement is at the `/determinus-apply` command seam (step 3c.5), not in `determinus_task_update` itself.

**Apply-loop ordering:**

| Step | Action                                                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 3a   | Start — `determinus_task_update status: "in_progress"`                                                                                              |
| 3a.6 | Clean Baseline Capture — verify clean tree, record HEAD/branch                                                                               |
| 3b   | Red Phase — write failing test                                                                                                               |
| 3c   | Green Phase — implement, tests pass                                                                                                          |
| 3c.4 | **Incremental Verification** — build/tests/lint pass                                                                                         |
| 3c.5 | **Checkpoint** — `determinus_task_checkpoint` with change/branch/HEAD/verification fires and verifies `taskCompletedSignal` to mark the task `done` |
| 3d   | Complete — verify checkpoint output (`checkpointRecorded:true`); do not call `determinus_task_update status: "done"` in normal apply flow           |

**Failure classification:**

| Classification                                    | Action                                                |
| ------------------------------------------------- | ----------------------------------------------------- |
| `SEMANTIC` (hook rejection, branch/HEAD mismatch) | Diagnose, re-run (retry budget)                       |
| `ENVIRONMENTAL` (not a git repo, detached HEAD)   | Escalate via `question`                               |
| `TRANSIENT` (index.lock contention)               | Tool retries internally; remaining failure → SEMANTIC |

**Commit message format:**

- Subject: `chore(adv): checkpoint <task-id>` or `chore(adv): cancel checkpoint <task-id>`
- Body trailers: `Change: <change-id>`, `Task: <task-id>`, `Mode: complete|cancel`, `Reason: <reason>` for cancel, `Verification: <summary>`

**Staging:** `git add -A` — `.gitignore` is the safety net.
**Anti-patterns:**

- × Do NOT create `--allow-empty` commits
- × Do NOT bypass checkpoint for "small" tasks — clean-tree returns `{status:'clean'}` without committing
- × Do NOT push, merge, archive, release, amend, or force-push from checkpoint commits
  **Publication boundary:** Checkpoint commits are local rollback/audit points only. Publication remains a separate human-gated workflow.

Cross-link: `/determinus-apply` command (`.opencode/command/determinus-apply.md`) step 3c.5.

### Doom Loop Detection

| Exit             | Condition                     |
| ---------------- | ----------------------------- |
| ✓ Done           | Acceptance criteria met       |
| 🔁 Doom Loop     | 3 failed attempts             |
| 🌍 Environmental | Missing dependency → escalate |

After 3 failures: STOP → `[ADV:BLOCKED]` → document all 3 attempts → ask via `question`. Record `strategy_label` in `error_recovery.attempts[]`.

| × Bad               | ✓ Good                 |
| ------------------- | ---------------------- |
| Retry same approach | Try different strategy |
| Silent retries      | Document each attempt  |
| 4+ same method      | Escalate after 3       |

See also: `skill("determinus-diagnose")` Phase 1 for feedback-loop construction before choosing the next recovery strategy.

### External Conformance

Black-box AC verification run by external CI. Specs under conformance are "locked" after first archive — the agent cannot read conformance test source.

**Tool:** conformance checks are internal to the release pipeline (single multi-action flow: `status | init | lock | unlock | override | run`). The run reads a CI verdict artifact from `artifact_path` and returns `{verdict: 'PASS'|'DRIFT', run_id, failed: [{rq_id, summary}]}`.

**Location modes:**
| Mode | Path | Isolation |
|---|---|---|
| `subfolder` (default) | `.adv/specs/_conformance/` | In-repo, honor-system |
| `sibling` (opt-in) | `{parent}/advance-conformance-{pid}/` | External repo, guard-enforced |

**Archive gate:** Phase 5.5 of `/determinus-archive` runs conformance check before executing archive. DRIFT halts archive with 3 user options (fix locally / override / unlock). No auto-fix.

**Override audit:** Every unlock or override requires `{user, reason, re_verify_deadline}`. Recorded permanently in conformance state.

**State location:** `$XDG_DATA_HOME/opencode/plugins/advance/{pid}/conformance.json` (external, project-keyed).

<!-- rq-twf01 -->

**Enforcement layers:** (1) conformance bash guard blocks git clone/curl/wget on locked sibling paths, (2) `tool.execute.before` blocks conformance checks during execution gate, (3) path policy blocks read/glob/grep/lgrep on locked conformance directories, (4) in strict mode (`worktree_guard_enforce=true`), trunk write firewall (`plugin/src/tools/trunk-write-firewall.ts`) blocks direct file writes and known destructive bash writes to the trunk checkout on the default branch.

### Trunk Write Firewall

When `worktree_guard_enforce=true`, `tool.execute.before` checks `write`/`edit`/`morph_edit` targets plus known destructive bash write patterns (`>`/`>>`, `tee`, `sed -i`, `cp`, `mv`, `rm`). Trunk evaluation is target-relative: each write target is checked against the git worktree topology of the repository that owns it, so a foreign repository's main checkout on its own default branch blocks exactly like the session project's trunk, and a linked, non-prunable worktree of any repository is allowed. Conservative foreign defaults: when a target repo's worktree topology cannot be probed, its resolved git root is evaluated as its own main checkout; stale (prunable) topology entries never confer worktree eligibility. Writes to ADV worktrees, outside repos, or active git recovery states (`MERGE_HEAD`, `REBASE_HEAD`/rebase dirs, `CHERRY_PICK_HEAD`, `REVERT_HEAD`) are allowed. A narrow allowlist of determinus-generated trunk artifacts (`ROADMAP.md`, `CHANGELOG.md`, `.adv/github-project.json`, `.adv/roadmap-snapshot.json`) bypasses the block only as exact root-relative paths at the target repository's main checkout root; nested paths are never exempt. Git commands are not classified or blocked by this firewall; P32 is enforced by where files are edited, not by restricting git operations. Residual risk: shell-variable indirection, shell aliases/functions, and script-internal writes may evade string parsing; ADV still forbids intentional trunk-checkout file writes outside worktrees.

### Cross-Repo Execution

"Out of scope for this repo" / "different repository" / "cannot modify external code" are invalid cancellation reasons. Correct action: switch `workdir` to the task's `target_repo`/`target_path` and execute. If a task hints at another repo but lacks metadata, confirm via `question`.

Config: `related_repos` in `project.json` maps repo IDs to paths.

Review/Harden gates block if cross-repo tasks incomplete or cancelled without approval.

### Change Origin Linkage Strategy

ADV change ≠ GH issue. ADV change = durable disk-owned state machine (gates, tasks, validation, archive). GH issue = registered intent on GitHub. Reference each other; neither reduces to other.

Three flow directions. All valid:

| Kind        | When                                                                       | Issue creation                                            | Auto-close on archive              |
| ----------- | -------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------- |
| `roadmap`   | Promoted from GH Project / ROADMAP.md via `/determinus-roadmap` → `/determinus-proposal` | Issue upstream — `change.origin.issue_number` required    | Yes (opt-in once automation ships) |
| `discovery` | Mid-session find (bug, drive-by, `/determinus-improve` hit)                       | Optional post-hoc                                         | No                                 |
| `triage`    | `/determinus-triage` promotes non-GH artifact (agenda, wisdom, note, TODO)        | Created by `/determinus-triage`; `issue_number` set on promotion | Yes                                |
| `adhoc`     | Explicit, no upstream (spikes, legacy)                                     | Never                                                     | Never                              |

Typed primitive: `change.origin = { kind, issue_number?, source_artifact? }` (`plugin/src/types/changes.ts`). Optional for back-compat; legacy → `adhoc` on read.

**Source-of-truth split:**

| Surface                                                     | Source of truth                     | Why                                                                                                       |
| ----------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| ADV initiative planning (multi-change initiatives, ordered shells/children) | ADV Epics (disk-backed)             | In-flight ADV initiative context, next-work recommendations, and shell-to-change promotion live with ADV state. |
| Ranked backlog                                              | GH Project v2 + `ROADMAP.md` mirror | Multi-stakeholder, public, score fields (V/TC/RROE/E/WSJF). Moving backlog into ADV state kills stakeholder surface. |
| In-flight ADV state (changes, tasks, gates, agenda, wisdom) | on-disk change projections (sole authority) | Session-coordinated, gate-validated, replay-safe. GH can't model.                                         |
| Linkage                                                     | `change.origin` (in `change.json`)  | Linkage IS ADV state. Lives with rest of ADV state.                                                       |

**Current scope:** Schema shipped (`change.origin` field, `determinus_change_create` accepts origin args, cross-references active changes by `origin.issue_number`). Linked roadmap/triage archives close upstream issues by default per `rq-issueChangeLinkage02`. Remaining behavior automation (`/determinus-proposal #N` body prefill, reverse-indexed recommendations) = follow-up change. × Don't short-circuit inline.

**Anti-patterns:**

| × Bad                                           | ✓ Good                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Auto-create GH issue from every `/determinus-proposal` | Only when `origin.kind === 'roadmap'`; post-hoc promotion is `/determinus-triage` job |
| `linked_issues[]` as canonical link             | `change.origin.issue_number` — single, typed, queryable. Arrays advisory only. |
| Move ranked backlog into ADV state             | Keep in GH Project. `.adv/roadmap-snapshot.json` = agent-readable mirror.      |
| Ship behavior + schema together                 | Schema first, validate via cross-refs, then automation.          |
| Default new change to `origin.kind = 'roadmap'` | Default omitted or explicit. `roadmap` requires `issue_number`.                |

**Agent picks `origin_kind` at create:**

- From `/determinus-roadmap` rec → `roadmap` + `origin_issue_number: N` (or use `/determinus-proposal #N` which sets these automatically — `rq-issueChangeLinkage01`)
- From mid-session bug → `discovery`
- From `/determinus-triage` promotion → `triage` + `origin_source_artifact: <ag-id|wisdom-id|...>` + `origin_issue_number: <created-issue>` (`rq-issueChangeLinkage01`)
- Ad-hoc, no upstream → `adhoc` (or omit)

**Active linkage requirements:**

<!-- rq-issueChangeLinkage01 -->

- `rq-issueChangeLinkage01`: `/determinus-proposal #N` MUST resolve issue body via `gh issue view`, sanitize via `rq-roadmapOriginSanitize01`, set `origin.kind='roadmap'` + `origin.issue_number=N` on the created change. Same contract used by `/determinus-triage` triage-origin tagging (with `kind='triage'`).

<!-- rq-issueChangeLinkage02 -->

- `rq-issueChangeLinkage02`: `/determinus-archive` MUST default to closing linked GitHub issues after push verification when `origin.kind ∈ {'roadmap', 'triage'}` and `origin.issue_number` is positive, unless `--no-close-issue` is passed. `--close-issue` MUST remain accepted as backward-compatible explicit affirmative / no-op. Exit-code-only error handling (gh natively idempotent). Failure non-fatal (`[ADV:ATTN]`); archive state canonical, no rollback.

<!-- rq-issueChangeLinkage03 -->

- `rq-issueChangeLinkage03`: `github_project` linkage config MUST live in `.adv/github-project.json` with dedicated Zod schema (`plugin/src/storage/github-project-config.ts`). Legacy `project_metadata['github_project']` is read-only fallback that migrates forward on first read; legacy entry NOT deleted post-migration.

Uncertain? Omit. Legacy semantics safe.

### Epic Context

Epics are **optional** initiative containers for related ADV changes and lightweight shell entries. They replace project-level `ROADMAP.md` as the primary ADV planning surface for initiative-level work, but they do not replace GitHub Project/stakeholder intake or make membership mandatory. Product Epics may span multiple determinus-enabled repos/projects while preserving one compact membership projection per child change through typed `target_path` membership tools.

When a change has `epic_membership`:

1. Load compact Epic context with `determinus_change_show` (Epics include entries).
2. Surface Epic ID, title, entry ID, order, entry title, projection source, and repo/project owner metadata when present in change show/status/resume outputs.
3. Use Epic order as advisory for next-work recommendations: warn about earlier incomplete entries, but do not block gates, tasks, or promotion solely because of order.
4. Include Epic context in sub-agent prompts when it helps the worker understand initiative scope.
5. During archive/release, verify terminal projection evidence for the linked Epic entry after release proof, use typed repair/backfill when an already-archived child still appears active, and include the Epic verification/repair result in the archive report.
6. If no Epic membership is present, render the change identically to the pre-Epic flow.

<!-- rq-epicOpsPlanning01 -->

Operational work is contextual, not universal. When an Epic's delivery changes require operational work — for example first deployment, migration, backfill, deployment configuration, monitoring, cleanup, or teardown — assess it during planning, but represent required operational work only through typed change/task dependencies and `ops_followup_links[]` on the relevant delivery change. Use relationship `blocks` when release safety requires the work to complete before release (a hard release blocker while incomplete); use the release-first relationships `follows_release`, `monitors`, or `cleanup_after` for post-release follow-through, which do not block release unless an explicit `required_handoff` is recorded. Release/archive readiness still derives from child/source-of-truth state or fresh reconciliation (`rq-opsRunReleaseReadiness01`), provenance stays typed (`rq-opsFollowTrace01`), and `blocks`-vs-release-first consequences stay on the existing release gate (`rq-opsFollowRelease01`). Shell entries, agenda items, and free-text prose are discovery aids only, never the authoritative record for required operational work. Do not infer operational need from Epic metadata, do not require an ops follow-up for every Epic/change/deployment, do not make Epic order a release gate, and do not execute deployments from Epic planning — production execution stays governed by the existing ops runbook and approval requirements on the child ops change.

Existing changes can be linked into, unlinked from, or moved between Epics only through `determinus_change_update link_change`, `determinus_change_update unlink_change`, and the combination of both with audit evidence. For Epic membership updates, route the child project with `target_path` and use supported owner-project routing when the Epic is remote. For `projection_pending`, `projection_stale`, `projection_mismatch`, or `target_unreachable` states, use `determinus_change_show` to load the Epic including entries and trigger supported bounded convergence; default Epic views show bounded `member_status`, not full target-project traces. For cross-project shell-shaped work, create or use the target-project ADV change first, then link it into the owner Epic with `determinus_change_update link_change`; do not claim direct cross-project shell promotion unless the change update surface provides structural target support.

Avoidances:

- × Do not make every ADV change belong to an Epic.
- × Do not add Jira-like assignments, estimates, boards, sprints, or ownership workflows.
- × Do not clone GitHub Projects.
- × Do not require shell entries to complete full ADV proposal/discovery before promotion.
- × Do not overload `fast_follow_of` for retroactive Epic membership.
- × Do not manually edit ADV state to link, unlink, move, or repair Epic membership.
- × Do not revive a project-level shared workflow pattern without explicit design proof.
- × Do not use Epic shell entries, agenda items, or free-text prose as the authoritative record for required operational work; route it through typed change/task dependencies / `ops_followup_links` linked to the relevant delivery change.
- × Do not require an ops follow-up for every Epic, change, or deployment; operational need is a contextual assessment, not an Epic-metadata heuristic.
- × Do not execute deployments from Epic planning or make Epic order a release gate.

### Cross-Project Coordination

Use when a source ADV change references/contributes to another determinus-enabled project via `target_path`.
Reads use `snapshot-ok` + `_projectContext`; mutations use `authoritative` + reachable target disk store. Untrusted mutation requires `target_confirmed: true` + `confirmationEvidence`. Never direct ADV state file reads/writes. `cross_project_links` records provenance; `external_dependencies` warn only and never block gates/archive by default. Inspect `_externalDependencyStatus`; flow: create/link → verify source link → monitor advisory dependencies → confirmed target mutation.

#### `target_path` matrix (which tools support cross-project)

- `snapshot-ok`: `determinus_change_show`, `determinus_change_list`, `determinus_change_show validate: true`, `determinus_status`, `determinus_task_show`, `determinus_task_list`, `determinus_task_ready`.
- `authoritative`: `determinus_change_update`, `determinus_change_create`, `determinus_change_archive`, `determinus_change_close`, `determinus_task_update`, `determinus_task_cancel`, `determinus_task_add`, `determinus_gate_status`, `determinus_gate_complete`, `bin/adv doctor`, `determinus_run_test`. Epic membership updates use `determinus_change_update` with link/unlink/reorder fields and require trust confirmation when routed to another project.
- Current-project only: `determinus_reflect`, internal conformance checks, `determinus_wisdom_*`, `determinus_project_context`.

Missing `target_path` and genuinely cross-project? Switch sessions: `cd <other-project> && opencode`.

<!-- rq-dryRunMutation01 rq-crossProjectTaskMutation01 -->

**Cross-session ADV mutation:** `opencode run --dir <other> --agent build --dangerously-skip-permissions "Run X tool"` works but pays ~60–300s per call. Use sparingly; for >5 sequential ops, open a session in the target project.

**Dry-run mutations:** same success shape + `dryRun: true`; no ADV state writes, conformance audit writes, worktree deletion/hooks, or filesystem writes. `target_path` dry-runs may read target state without untrusted mutation confirmation because they do not mutate.

<!-- rq-nonLlmToolExec01 -->

No direct non-LLM ADV tool-exec helper ships until OpenCode exposes stable tool execution (or equivalent structural runtime path). Do not build ad-hoc CLI paths that duplicate STSL, store lifecycle, target trust gates, or audit semantics. Track #71 / upstream `anomalyco/opencode#25478`.

#### `status: "in-flight"` filter shorthand

`determinus_change_list status: "in-flight"` returns the open stored status `draft` — the only lifecycle-open value in the stored `ChangeStatus` enum (`draft`/`archived`/`closed`). Use this when an agent prompt or human asks "what's in flight" without caring about the specific stored status. The filter is **input-only**; it never appears as a stored `status` value on a change. The plain `"active"` and `"pending"` filters are rejected with a hint to use `"in-flight"` (those values are never stored on changes); `"archived"` and `"closed"` select terminal changes.

### Cancellation Policy

All cancellations require explicit user approval via `determinus_task_cancel`.

Workflow: identify tasks + reasons → present to user via `question` → user approves → call `determinus_task_cancel` with evidence.

### Large-Scope Validity

Planned-and-structured size is valid. Once a change has completed the prep gate
with `userApproved`, the agent MUST NOT suggest splitting based on size, complexity,
or task count alone.

| × Bad                                    | ✓ Good                                                   |
| ---------------------------------------- | -------------------------------------------------------- |
| "This seems large, want to split?"       | Trust the prep gate; execute                             |
| "Maybe break this into smaller changes?" | Execute as planned                                       |
| Mid-execution split-suggestion           | Mid-execution scope discovery → scope-discovery protocol |

For the canonical scope-discovery protocol (when non-campsite scope is found
mid-execution), see `docs/scope-discovery-protocol.md`.

### Task Status Report

On loop stop or compaction: emit `[ADV:TASK_STATUS_REPORT]` with completed/cancelled/remaining. Canonical display rules live in [docs/specs/chat-output-display.md](docs/specs/chat-output-display.md).

### Post-Remediation Re-Verification

After `/determinus-review` or `/determinus-harden` fixes findings, re-scan only affected dimensions. Do NOT re-run all scanners after fixes.

### Validated In-Scope Remediation Policy

Validated in-scope findings from review/harden MUST be fixed before archive. No report-only, future-work, or accepted-debt path for findings within the change's touched scope. Out-of-scope findings are documented separately and do not block archive.

### Touched-Scope Quality Ownership

Quality obligations extend to:

- Directly touched implementation files
- Adjacent tests and docs
- Same-pattern local subsystem issues (P25 related-scan)

Do NOT expand into implicit repo-wide refactors or untouched subsystems. Campsite-rule fixes (P23) are opportunistic and must be small, safe, and local.

### Ambiguity Taxonomy

11-category ambiguity taxonomy used by `/determinus-proposal` (B/F/S scan), `/determinus-discover` (B/F/S/M scan), `/determinus-clarify` (findings-driven mode), and `/determinus-audit` (B/F/S/Q/E spec-law scan). Composes alongside `plugin/src/validator/clarify-readiness.ts` (6 heuristic checks, `severity: "warning"`); reuses `clarify_enforcement` flag (`off`/`advisory`/`strict` in `plugin/src/types.ts:1194-1196`).

**Two-surface taxonomy:**

| Surface          | Context                                       | Categories        | Source                                                  |
| ---------------- | --------------------------------------------- | ----------------- | ------------------------------------------------------- |
| Change artifacts | In-flight proposal/discovery/agreement/design | B, F, S, **M**    | `/determinus-proposal` Phase 2.6, `/determinus-discover` B/F/S/M scan |
| Spec laws        | Committed `.adv/specs/*.md` files             | B, F, S, **Q, E** | `/determinus-audit` Phase 3 inline scan                        |

**Required-set difference:**

- **M** (Missing Information) is change-artifact-only — it captures critical unknowns about the change itself.
- **Q** (Quality Attributes) and **E** (Error Handling) are spec-law-specific — they capture NFR and failure-mode gaps in committed specifications.
- B, F, S are shared across both surfaces.

**Agent-side gap:** Categories D/X/Q/I/E/C/T are scan-optional in v1 — agent decides emission based on change domain.

#### Categories

| Prefix | Name                  | Scope                                          | v1 Enforcement               |
| ------ | --------------------- | ---------------------------------------------- | ---------------------------- |
| **B**  | Boundaries            | What is explicitly in/out of scope; edge cases | Required                     |
| **F**  | Functional Scope      | Required features, behaviors, data flows       | Required                     |
| **S**  | Completion Signals    | Measurability of success/done criteria         | Required                     |
| **M**  | Missing Information   | Critical unknowns, unspecified dependencies    | Required                     |
| **D**  | Data Assumptions      | Data shape, volume, freshness, ownership       | Optional (v2 promotion path) |
| **X**  | External Dependencies | Third-party API, service, or tool constraints  | Optional (v2 promotion path) |
| **Q**  | Quality Attributes    | NFRs: performance, security, accessibility     | Optional (v2 promotion path) |
| **I**  | Integration Points    | Handoffs between systems, modules, teams       | Optional (v2 promotion path) |
| **E**  | Error Handling        | Failure modes, recovery, rollback paths        | Optional (v2 promotion path) |
| **C**  | Conformance           | Standards, compliance, regulatory requirements | Optional (v2 promotion path) |
| **T**  | Temporal Constraints  | Ordering, timing, deadlines, milestones        | Optional (v2 promotion path) |

#### Finding Shape

```
{Letter}{N}  {SEVERITY}  {Category}  {Finding text}
  Evidence: {verbatim quote from source OR `(no {section} section)`}
  Reason: unclear because {X}
```

- `{Letter}{N}` — sequential finding ID within category (B1, B2, F1, S1, ...)
- `{SEVERITY}` — CRITICAL | HIGH | MEDIUM | LOW

#### Severity Rubric

| Severity | Meaning                                                                        | Example                                                                 |
| -------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| CRITICAL | Structurally missing required content; cannot proceed without resolution       | Missing `### Out of Scope` subsection, no `## User Outcomes` section    |
| HIGH     | Vague or unmeasurable language that will cause ambiguity during implementation | Success criteria "fast response" without threshold                      |
| MEDIUM   | Soft ambiguity that may cause rework but is resolvable during implementation   | Implicit ordering dependency not stated                                 |
| LOW      | Minor clarity improvement; does not block execution                            | Inconsistent terminology across sections                                |

#### Anti-Hallucination Evidence Rule

Every finding MUST include verbatim source quote OR explicit absence marker. × MUST NOT fabricate, paraphrase, or infer.

| Evidence form  | Format                                           |
| -------------- | ------------------------------------------------ |
| Verbatim quote | `Evidence: proposal.md:{section} "{exact text}"` |
| Absence marker | `Evidence: (no {section} section)`               |

Findings without valid evidence are malformed and MUST NOT be surfaced.

#### Trigger Threshold

- **CRITICAL ≥ 1** → halt current phase, hand off to `/determinus-clarify`
- **HIGH ≥ 2** → halt current phase, hand off to `/determinus-clarify`
- **Single HIGH** → warning only, continue phase
- Skip trigger evaluation when `clarify_enforcement: 'off'`

Applies in `/determinus-proposal` (B/F/S scan) and `/determinus-discover` (B/F/S/M scan).

#### Coverage Report

Emit per scan: `Coverage: B:C F:P D:C X:C Q:P I:N/A E:P C:C T:C S:P M:M`.

| Code | Meaning                       |
| ---- | ----------------------------- |
| C    | Clear (no ambiguity)          |
| P    | Partial (some vagueness)      |
| M    | Missing (no content found)    |
| N/A  | Not applicable to this change |

Required categories (B/F/S/M) MUST have a coverage entry; optional MAY be omitted (treated as N/A).

## 7-Gate Quality Checklist

<!-- rq-gatemodel01 -->

| Gate            | Triggered By                        |
| --------------- | ----------------------------------- |
| 1. `proposal`   | `/determinus-proposal`                     |
| 2. `discovery`  | `/determinus-discover` / research workflow |
| 3. `design`     | `/determinus-design`                       |
| 4. `planning`   | `/determinus-prep`                         |
| 5. `execution`  | `/determinus-apply`                        |
| 6. `acceptance` | `/determinus-review` + user acceptance     |
| 7. `release`    | `/determinus-harden` + `/determinus-archive`      |

Gates are sequential. Archive blocks until release readiness is verified. See [docs/determinus-gates.md](docs/determinus-gates.md).

**Post-release deploy:** Deployment is outside ADV's gate lifecycle — ADV stops at push. Post-release deploy is a separate, user-initiated step.

<!-- rq-extConfGate01 --> When spec conformance is enabled, the archive flow runs an external CI conformance check at Phase 5.5 (between user sign-off and execute archive). DRIFT verdicts halt archive and present user options; no auto-resolve.

Gate behaviors:

- `discovery`/`planning` evaluate full change including completed tasks — completed work is evidence to validate, not acceptance proof. Add follow-up tasks where gaps found.
- `acceptance` emits `REVIEW_FINDINGS` block (blocker, issue, suggestion, question) and records user acceptance.
- `release` runs hardening, archive spec promotion, git finalization, worktree cleanup, and reflection.

### Scope Boundaries & Negative Constraints

Negative constraints flow through artifacts in a structured refinement path:

| Artifact | Section | Purpose | Contract Kind |
|----------|---------|---------|---------------|
| `proposal.md` | `### Must Not` | Early negative constraints (seeds avoidances) | — (advisory, not parsed) |
| `agreement.md` | `## Avoidances` | Refined, confirmed avoidances | `avoidance` (prefix `DONT`) |
| `agreement.md` | `## Out of Scope` | Boundary exclusions | `out_of_scope` |

**Refinement flow:** `Must Not` (proposal) seeds `Avoidances` (agreement) → parsed into `ChangeContract` items → checked by design validator + drift detection + review matrix.

**Key infrastructure:**
- `contract-mint.ts` parses `## Avoidances` heading via regex `/^(avoidances|avoidance|do not|do nots)$/i`
- Avoidance items get `DONT` prefix in contract IDs
- Design validator checks tasks don't violate avoidance constraints
- Drift detection in `/determinus-review` and `/determinus-harden` flags avoidance violations as blockers

### Gate Artifact Validators

Each gate requires a minimum artifact before completion. Enforcement lives in `gate-readiness.ts`.

| Gate | Required Artifact | Validator |
|------|-------------------|-----------|
| `proposal` | `proposal.md` | `ARTIFACT_BACKED_GATES` map |
| `discovery` | `agreement.md` | `ARTIFACT_BACKED_GATES` map |
| `design` | `design.md` | `ARTIFACT_BACKED_GATES` map |
| `acceptance` | `acceptance.md` | `ARTIFACT_BACKED_GATES` map |

**Validation checks** (`stateBackedArtifactEvidence()`):
1. Artifact file exists in change state
2. Content ≥ 20 non-whitespace characters (rejects stubs)
3. Metadata present (creation timestamp)

**Blocking conditions:** `ARTIFACT_MISSING` (file absent) or `ARTIFACT_UNDERSIZED` (< 20 chars) prevent gate completion. Compile-time `_gateArtifactKindCheck` in `types/gates.ts` ensures type safety of the gate→artifact mapping.

## Command Execution Model

All commands run inline by default. Agents without `task` tool work inline exclusively.

### Slash Command Boundary

Slash commands are top-level entry points for the user/session, not an internal dispatch mechanism for agents.

- Agents must NOT invoke `/determinus-*` from inside another agent workflow or sub-agent prompt
- OpenCode may re-dispatch slash commands through command frontmatter `agent:` routing, which can override the current agent context and compound orchestration
- When an agent needs an ADV workflow, it must execute that workflow inline with tools (or read the command file as a contract) rather than calling the slash command itself

### Delegation Defaults

<!-- rq-delDefaults01 rq-delDefaults02 rq-delDefaults03 rq-delDefaults04 -->

The workflow-step delegation matrix is Determinus source-plane law in `delegation-defaults` (`.adv/specs/delegation-defaults/spec.json`). It is the source/evaluation artifact for step mode, allowed sub-agents, delegated sub-steps, and safety boundaries. Do not duplicate the matrix here; source maintainers update the spec and asset tests. Runtime field agents consume deployed command/agent guidance and must not be required to inspect this repo-local spec during normal downstream workflows.

Design gate requires mandatory independent `determinus-researcher` validator before completion (`VALIDATED`, `CAUTION`, `CONFLICT`, `INCONCLUSIVE`). Command files carry the exact operational packets for delegated sub-steps.

Utility commands keep their own delegation rules in command files, not the workflow-step matrix. Examples of utility fan-out:

| Command   | Pattern                         | Worker                                          |
| --------- | ------------------------------- | ----------------------------------------------- |
| slop-scan | Sequential categories           | explore × 9 (single-level only)                 |
| arch-scan | Stack packs + research fallback | none; run stack tools, Context7, and Exa inline |

For `/determinus-slop-scan`, all `explore` scanner workers must do the scan inline and must not delegate to additional sub-agents or invoke `/determinus-*` slash commands.

For `/determinus-arch-scan`, run stack-pack tools, Context7, and Exa inline; do not spawn sub-agents unless the command contract changes.

### Delegation Routing

| Priority | Check                                                                                  | Result             |
| -------- | -------------------------------------------------------------------------------------- | ------------------ |
| 1        | `metadata.delegation_hint` set?                                                        | Use hint value     |
| 2        | `tdd_intent == "not_applicable"`?                                                      | `delegate_allowed` |
| 3        | Title matches `isTrivialTask` patterns?                                                | `delegate_allowed` |
| 4        | Risk signals (multi-file, cross-repo, architectural keywords, failing-test diagnosis)? | `inline_required`  |
| 4.5      | Context-shed test passes? (4-question AND, floor ~5 files or ~50 lines)                | `delegate_allowed` |
| 5        | Default                                                                                | `inline_required`  |

<!-- rq-contextShed01 -->
<!-- rq-contextShed02 -->

Context-Shed Test = all four true + floor met (~5 files OR ~50 lines): decided HOW, HOW does not feed downstream decisions, AC defined, mechanical implementation. Unsure → `inline_required`. After delegation, P23 campsite scan touched scope.

ADV code-writing → `determinus-engineer` (not `general`). Verify-burst → `determinus-verifier` (`general` fallback only if unavailable). Generic non-ADV ops → `general`.

### Orchestrator-Session Operational Routing

This table is session-level operational routing, distinct from task-level Step 4.5. Use it when primary `adv` is about to do broad authority-free operational work outside a task handoff. Do not run a second primary recon/shell/test/CI-check cycle before delegating when the next step fits one of these rows. Repeated local verify failures and CI/check-run failures should use structured verification triage before a second primary digest cycle when the next step is authority-free.

| Trigger | Worker |
| --- | --- |
| >5 file reads/searches expected | `explore` |
| repo structure / dependency map / same-pattern scan | `explore` |
| DB/log/status/usage audit | `general` |
| GitHub CI / check-run / status investigation | `general` |
| repeated verify/test bursts | `determinus-verifier` |
| code edits after task scope known | `determinus-engineer` |
| frontend/component implementation | `determinus-engineer` first; `determinus-designer` matching-cycle follow-up |
| docs/source research first-pass | `general`; use `determinus-researcher` when sourced architecture authority is needed |

Primary `adv` still owns gate completion, task-graph mutation, checkpoint/archive/sign-off, scope drift, contract compromise, safety, release, and user-facing synthesis. Worker output is evidence, not authority.

### Context Packet Standards

Apply packet includes: WORKING DIRECTORY, CHANGE, TASK, ATTEMPT, AFFECTED FILES, DESIGN EXCERPT, ACCEPTANCE CRITERIA, EXPECTED OUTPUT.

`WORKING DIRECTORY` required. `determinus-engineer` passes it as `workdir` to every `bash`, `read`, `write`, `edit`, `morph_edit`, `determinus_run_test`. See `.opencode/agents/determinus-engineer.md § Working Directory Lock`.

EXPECTED OUTPUT: implement, test, call `determinus_subagent_report_submit` with typed `ENGINEER_REPORT` per `.opencode/agents/determinus-engineer.md`.

#### ENGINEER_REPORT Payload

Required keys: `schema_version`, `change_id`, `task_id`, `attempt`, `agent`, `scope`, `status`, `files_touched`, `verification`, `decisions`, `blockers`, `follow_ups`, `related_scan`, `workdir_used`, `context_update_for_adv` (`what_ads_needs_to_know`, `suggested_next_action`). `agent` MUST equal `"determinus-engineer"`. Schema: `.opencode/agents/determinus-engineer.md` § ENGINEER_REPORT Payload.

### Structured Sub-Agent Prompt Protocol

Every sub-agent spawn must include: ROLE:, OUTPUT_SCHEMA:, BUDGET:, STOP_WHEN:. See individual command files for dimension-specific packets.

### Orchestration Token-Budget Policy

When to spawn: 3+ independent scan dimensions. Max parallel workers: 3 (agent-self-enforced; no runtime guard). Batch: spawn 3 → wait → next batch. Cap total sub-agents per command at 6 across batches. Inline for sequential/context-dependent work.

### Phase Summary Pattern

After each phase, `determinus_change_update` records compact summaries. Do not duplicate full context; detailed inspection uses `determinus_change_show`.

## Sub-Agent Selection

### Agent Tiers

Primary agents: `adv`, `plan`, `build` (not spawnable). Spawnable: global `explore`, `general`; bundled global `determinus-researcher`, `determinus-engineer`, `determinus-reviewer`, `determinus-designer`, `determinus-visual-review`; repo-local `determinus-tron`, `determinus-verifier`. Skill/inline only: `prioritizer` via `skill("prioritizer")`. Only `mode: subagent` agents spawn via Task.

### Agent Roster

| Agent            | Use                                                                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `explore`        | Code navigation, scoped read-only scans                                                                                                                                                                                 |
| `determinus-researcher` | Docs/API/examples research + architecture validation; independent validator                                                                                                                                             |
| `determinus-engineer`   | Delegated ADV code-writing (backend/state/API/business logic); must use packet `workdir`; submits typed `ENGINEER_REPORT`                                                                                               |
| `determinus-designer`   | Apply-phase frontend/component follow-up specialist (HTML/CSS/JS/TSX, a11y, responsive, polish, site-design match) after engineer or inline receipt; write-only, never review/harden owner; submits typed `DESIGNER_REPORT` per `.opencode/agents/determinus-designer.md` |
| `determinus-reviewer`   | `/determinus-review` and `/determinus-harden` analysis/remediation; submits typed report. Reviewer packet carries `FRONTEND DESIGN REVIEW SKILL` anchor for design-inclusive changes                                                  |
| `determinus-visual-review`  | Image analysis (screenshots, UI captures) for text-only model orchestrators                                                                                                                                            |
| `determinus-verifier`       | Verify-only bursts and structured local verification triage; returns strict Verification Triage Result JSON; no edits or ADV mutation                                                                                  |
| `general`            | Generic multi-step work and unavailable-runtime fallback for verify bursts                                                                                                                                              |
| `determinus-tron`       | Recon + hotspots (repo-local; **command-only** via `/determinus-tron` — never agent-spawned)                                                                                                                                                                                           |

`determinus-tron` repo-local. `determinus-researcher` / `determinus-engineer` / `determinus-reviewer` / `determinus-designer` bundled global via `scripts/deploy-local.sh`. Research pattern: `determinus-researcher` covers docs/API/examples + architecture in a single spawn. Apply routing: structural `metadata.frontend == "true"` starts with `determinus-engineer` (or a risk-forced inline implementation), then dispatches matching-cycle `determinus-designer` follow-up with an implementation receipt; `metadata.delegation_hint` cannot select designer as the initial classified frontend implementation route.

## Skill Discovery Protocol

Enabled in `/determinus-research`. Filesystem-only, no API calls.

| Step    | Action                                                                                       |
| ------- | -------------------------------------------------------------------------------------------- |
| Search  | Trusted skill dirs only: `~/.config/opencode/skills/*/SKILL.md`, repo `skills/*/SKILL.md`    |
| Match   | Read YAML frontmatter, match `keywords` against tech stack + change domain                   |
| Load    | `skill("{name}")` → apply guidance                                                           |
| Trust   | × Never auto-load arbitrary `*/SKILL.md` outside trusted dirs without explicit user approval |
| Degrade | Skip skills without frontmatter/`keywords`; no matches → proceed normally                    |

Skill metadata: YAML frontmatter with `name`, `description`, `keywords`.

<!-- rq-domainContext01 -->

**Domain context artifacts:** Projects MAY maintain root `CONTEXT.md` or `CONTEXT-MAP.md` + per-context `CONTEXT.md` as domain glossary. `/determinus-discover`, `/determinus-design`, `/determinus-clarify` MAY read for domain-language alignment. Lazy creation; advisory only. See `.adv/specs/domain-context/`.

### Excluded Skills

Pocock overlap skills remain excluded from ADV skill selection:

| Skill             | Rationale                                                                        |
| ----------------- | -------------------------------------------------------------------------------- |
| `grill-me`        | Superseded by `/determinus-clarify`; ADV owns clarification gates.                      |
| `grill-with-docs` | Reference docs vendored into `domain-context`; workflow overlap excluded.        |
| `to-prd`          | Superseded by `/determinus-proposal`; proposal gate owns problem/criteria contract.     |
| `to-issues`       | Superseded by `/determinus-triage`; GH issue promotion stays HITL-governed.             |
| `triage`          | Superseded by `/determinus-triage`; WSJF + ROADMAP mirror already gate-aware.           |
| `tdd`             | Superseded by RSTC TDD Protocol; task metadata and verification own correctness. |

### Adopted Skills (Open-Zone Resolutions)

The following Pocock skills were not excluded but adopted as ADV vendored skills. They supplement ADV methodology without conflicting with the gate-bound model.

| Skill                          | Adopted as                  | Rationale                                                                                                                                                              |
| ------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codebase-design`              | `determinus-codebase-design`       | Adopted 2026-07-08 for change `adoptCodebaseDesignImprove`. Vocabulary reference (deep-module terms + deletion test + dependency categories). License: MIT.             |
| `improve-codebase-architecture`| `determinus-improve-codebase-architecture` | Adopted 2026-07-08 for change `adoptCodebaseDesignImprove`. Procedural organic-exploration + HTML-report workflow (`disable-model-invocation: true` preserved). License: MIT. |

## Skill Creation Protocol

Enabled in `/determinus-discover` and `/determinus-research`. Conservative — only triggers for the change's core problem domain.

### Trigger Conditions (ALL must be true)

| #   | Condition                                                                    |
| --- | ---------------------------------------------------------------------------- |
| 1   | No matching skill found for a domain                                         |
| 2   | Domain is clearly relevant to the change's **core problem** (not tangential) |
| 3   | No partial-skill match covers the domain                                     |

### Naming Convention

`agent-{domain-slug}` (lowercased, hyphenated). **× MUST NOT use `determinus-` prefix** — `scripts/deploy-local.sh` removes stale `determinus-*` skills from global dir.

### Assembly Template

Create `agent-{domain}/SKILL.md` with YAML `name`, `description`, `keywords`, `metadata.source: "agent-created"`, `review_status: "pending"`, `created_at`, `trigger_change`, then Purpose / Key Patterns / Common Pitfalls / Sources.

### Creation Flow

1. **Research domain** — Context7, Exa, searchcode → gather domain-specific guidance. Use Exa to discover candidate repositories, then searchcode to inspect code inside each public repo.
2. **Assemble** — populate template with research findings, include source citations
3. **Persist** — write atomically to `~/.config/opencode/skills/agent-{domain}/SKILL.md`
4. **Skip if exists** — if file already exists, report "skill already exists" and skip
5. **Load** — call `skill("agent-{domain}")` and apply guidance in current workflow
6. **Notify** — emit `[ADV:SKILL_CREATED]` with skill name, domain, and brief description

### Pending Review

Auto-created skills set `metadata.review_status: "pending"`. Next `/determinus-discover`:

| Step    | Action                                                         |
| ------- | -------------------------------------------------------------- |
| Scan    | Skills with `review_status: "pending"` BEFORE keyword matching |
| Surface | Present pending skills to user for confirmation                |
| Confirm | Update `review_status` to `"reviewed"`                         |
| Reject  | Delete the skill file                                          |

### Protocol Extension Note

When all trigger conditions are true, "no matches" → conditional creation trigger. Non-implementing agents report gap and proceed.

## Command vs Skill Boundaries

<!-- rq-skillProseCompression01 rq-skillClassification01 -->

Commands own workflow/state, user-facing invocation, mutation, gate completion. Skills hold reusable read-only methodology, domain knowledge, and command/sub-agent-loaded protocol.

### Load-site taxonomy

| Load site                   | Meaning / fallback                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `orchestrator-only`         | Main command loads skill for checkpoints/routing/gates; command embeds fallback.                                           |
| `worker-only`               | Worker loads methodology for self-contained work; orchestrator defines degraded/inconclusive handling before spawn.        |
| `split`                     | Orchestrator owns schema/routing/fallback/adoption/mutation; worker gets methodology detail; no auto-adopt beyond routing. |
| `inlined-agent-methodology` | Agent prompt carries methodology; skill mirrors/documents sync; command fallback remains and no extra worker delegation.   |

Worker skill-load availability is permissive: guard explicit `skill: false`, not missing `skill: true`; missing exposure degrades via command fallback.

### Reference Pattern

`determinus-tron` pattern: command owns orchestration/state/user interaction; skill owns protocol/search/report schema; command embeds fallback. Fan-out commands load skill before spawning and keep inline fallback is required.

### Classification

| Class                                 | Commands                                                                                                                                                                                        | Load site                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Command-only                          | `determinus-idea`, `determinus-problem`, `determinus-epic`, `determinus-proposal`, `determinus-research`, `determinus-task`, `determinus-validate`, `determinus-archive`, `determinus-status`                                                                 | —                           |
| Dedicated skill                       | `determinus-triage` → `determinus-triage`; `determinus-reflect` → `determinus-reflect`; `determinus-cleanup` → `determinus-cleanup`; `determinus-improve` → `determinus-improve`; `determinus-clarify` → `determinus-clarify`; `determinus-arch-scan` → `determinus-arch-detection` | `orchestrator-only`         |
| Dedicated skill with worker execution | `determinus-audit` → `determinus-audit`; `determinus-refactor` → `determinus-refactor`                                                                                                                                      | `split`                     |
| Scout skill                           | `determinus-discover`, `determinus-design` → `determinus-opportunity-scout`                                                                                                                                          | `split`                     |
| Architecture vocabulary skill         | `determinus-design`, `determinus-discover` → `determinus-codebase-design`                                                                                                                                           | `orchestrator-only`         |
| User comparison skill                 | `determinus-design` → `determinus-user-intuit`                                                                                                                                                                | `orchestrator-only`         |
| Shared skill                          | `determinus-harden`, `determinus-slop-scan` → `determinus-slop-detection`                                                                                                                                            | `split`                     |
| Dedicated agent + skill               | `determinus-tron` → `determinus-tron`                                                                                                                                                                         | `inlined-agent-methodology` |
| Embedded methodology                  | `determinus-discover`, `determinus-prep`, `determinus-apply`, `determinus-review`, `determinus-optimizer`; `determinus-harden` keeps embedded harden guidance alongside shared `determinus-slop-detection` scanner methodology                    | —                           |
| Dynamic discovery                     | `determinus-discover`, `determinus-research` (`skill("agent-{domain}")` placeholder only)                                                                                                                     | `orchestrator-only`         |

> **Stale-reference note:** `determinus-review-methodology`, `determinus-harden-methodology`, and `global-verify` are not shipped command skills. Calls to `skill("determinus-review-methodology")`, `skill("determinus-apply-methodology")`, or `skill("global-verify")` are stale/hallucinated command references — use the command's embedded protocol instead. `prioritizer` remains an optional inline skill/protocol outside command skill loading; command files use the embedded Tradeoff Prioritizer Protocol instead of a command-level `skill("prioritizer")` reference.

### Constraints

- Skills × MUST NOT mutate ADV state (no `determinus_change_create`, `determinus_task_add`, `determinus_gate_complete`).
- Skills × MUST NOT own gate completion or workflow sequencing.
- Commands MUST remain functional if a backing skill is unavailable — inline fallback is required.
- Checklist docs (`docs/checklists/`) are maintainer/reference docs only. Runtime command guidance MUST use embedded methodology or loaded skills, not source/install-tree checklist reads. <!-- rq-noSourceChecklistReads01 -->

## Worktree Integration

ADV uses external mutable state shared by worktrees. Specs stay in repo (`.adv/specs/`). `db_dir` / physical `db/` dirs are legacy only.

### External State

State: `$XDG_DATA_HOME/opencode/plugins/advance/{project-id}/` (`changes/`, `archive/`, `wisdom.jsonl`, `reflections.jsonl`). Worktrees: `$XDG_DATA_HOME/opencode/worktree/{project-id}/{branch}`. Legacy Agenda cleanup deletion requires approval.

### Worktree Policy

ADV always isolates mutating work in per-change worktrees.

- Every change runs in a worktree — create/reuse before Phase 1
- Worktree tools unavailable → hard block with error. Do not proceed in-place
- Existing worktree for same change → auto-reuse
- trunk write firewall enforcement is default-on (`worktree_guard_enforce=true` or omitted). Blocks main-checkout file writes, destructive bash, and task/gate execution mutations with `WorktreeIsolationViolation`, `mainCheckoutPath`, remediation. Use `determinus_worktree_create resume: true` path. Legacy explicit opt-out: only `worktree_guard_enforce: false` allows default-checkout file writes; omitted never opts out. Proposal gate remains exempt. Read-only tools + git commands allowed. Auto-managed changes engage guard regardless of global flag. Existing-worktree exception: a setup-ready ADV worktree for the change ALLOWs gate/task state-transition mutations from main regardless of the `worktree_auto_managed` marker (durable `worktrees` map is the structural authority); file-write isolation unchanged. Determinus repo opts into strict mode.

### Worktree Reuse

Before creating: `git worktree list --porcelain` → find `change/{change-id}`. Path exists → reuse; missing → `git worktree prune` → fresh.

### Worktree Setup Hooks

Setup lives in `.opencode/worktree.jsonc`. `sync.copyFiles` copies explicit opt-in files. `hooks.postCreate` runs after creation; failure marks worktree `setup_failed` and blocks ADV routing until fixed. `hooks.preDelete` runs before deletion. See `docs/worktree-guide.md` for examples + secret handling.

### Spec Divergence

| Data                             | Location             | Shared?                   |
| -------------------------------- | -------------------- | ------------------------- |
| Specs (`.adv/specs/`)            | In-repo, git-tracked | No (branch-local)         |
| Changes, archive, wisdom, agenda | External             | Yes (keyed by project-id) |

Spec changes in worktree A invisible to B until merged; merge promptly after archive.

### Worktree Protocol

`determinus_worktree_create` default `mode: "warp"`: create/reuse git worktree → register OpenCode `determinus-worktree` workspace → warp current session so later tools run at worktree root. Requires `OPENCODE_EXPERIMENTAL_WORKSPACES=true` (or `OPENCODE_EXPERIMENTAL=true`) before launch. ADV does not mutate `process.env`. If flag or `/experimental/workspace` unavailable → downgrade to `mode: "terminal"` with actionable warning. Already warped session → `SESSION_ALREADY_WARPED`; open fresh OpenCode session from trunk to create another worktree.

Side effect: `OPENCODE_EXPERIMENTAL_WORKSPACES=true` also changes OpenCode `client.session.list` filtering: same-project cross-workspace sessions included by default. ADV does not rely on this. No graduation timeline published; env-var opt-in is current mechanism.

Fallback modes: `mode: "terminal"` returns path; MUST use as `workdir` for all later tools. `mode: "spawn"` returns path for follow-up launch. Delete via `determinus_worktree_delete branch:<branch>` only after merge. Worktree cleanup uses canonical tool `determinus_worktree_delete`. Warp-mode delete attempts matching OpenCode workspace-row removal before git worktree removal; warns and continues if workspace cleanup fails.

### Worktree Cleanup

`/determinus-archive` Phase 9 owns structural git finalization: validate change worktree → commit `.adv/` archive/spec artifacts → detect default branch → prove no-remote local merge, post-fetch `origin/{default-branch}` reachability, or merged PR state. Remote-backed protected/policy routes include merge queue and PR + GitHub auto-merge: merge queue is supported as a route variant alongside `pr_auto_merge` and `pr_manual`; when queue rules apply, ADV pushes `change/{change-id}`, open/reuses one PR, and queues via documented GitHub `merge_group` semantics, skipping local reconciliation because the queue provides freshness via `merge_group`. `Pending auto-merge.` leaves release/archive incomplete until PR state is `MERGED`; `Blocked.` leaves the change active when PR/auto-merge, queue handoff, or origin proof is unavailable. Phase 9 assumes `gh` is authenticated with a local user token that has `write` repo access; CI-provided tokens (GitHub Actions `GITHUB_TOKEN`, App tokens) may lack merge-queue/auto-merge permissions (cli/cli #7213). `POLICY_DETECTION_FAILED` covers this case — archive blocks with remediation directing the user to authenticate `gh` with a local user token. `determinus_gate_complete gateId: "release"`, `phase9:"skip"`, and release recovery all revalidate the same proof (`rq-releaseFinalization01`). `bin/adv doctor` scans/re-drives archived-but-unmerged remote `change/*` branches through idempotent PR auto-merge without force-push when safe, or surfaces an approval-required proposal when the safe path is blocked. Post-merge local `change/*` branch deletion is git hygiene, not recovery: `determinus_worktree_cleanup mode=archived_branches` (operator-explicit; pass `dryRun=true` to preview). The batch terminal-projection repair over all release-stuck candidates and the single-change targeted status flip are internalized behind `bin/adv doctor` and gated on structural branch-merge or workflow evidence. × Never delete worktree with unmerged commits. Tools unavailable → `[ADV:BLOCKED] Worktree tools unavailable — hard block with error. Do not proceed in-place.`

## When to Use ADV

**Use for:** New features, breaking changes, architecture, compliance, unclear bug fixes via `/determinus-problem`
**Use lighter workflows for:** Typos, deps, exploration

### Provider ADV runtime hints

<!-- rq-scopedAdvInstructions01 --> `scripts/deploy-local.sh` writes one global `adv` runtime agent from lean canonical `.opencode/agents/adv.md`. `determinus_INSTRUCTIONS.md` remains full repo/dev reference; not appended wholesale into runtime `adv.md`. Runtime coverage: `docs/determinus-runtime-protocol-coverage.md`, specs, tests, command contracts. Provider-specific guidance injects at runtime through single system block when provider/model identity known. Retired `determinus-{provider}` generated agents not recreated; stale config needs manual cleanup.
