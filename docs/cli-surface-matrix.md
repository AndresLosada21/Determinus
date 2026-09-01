# CLI Surface Matrix

> Git-tracked disposition matrix for every ADV command and tool.
> Maintained by `plugin/src/cli-surface-matrix.test.ts` — additions or removals
> without a matching matrix row fail CI (AC1/AC2).

## Dispositions

| Keyword | Meaning |
|---|---|
| `cli-bridge-primary` | Default path is a thin CLI bridge; MCP depth kept for explicit diagnostics |
| `mcp+cli-additive` | Both CLI and MCP surfaces are useful; CLI adds CI/human value |
| `agent-workflow-only` | Agent judgment, HITL, or multi-step workflow required; no CLI simplification |
| `keep-mcp-only` | Low standalone CLI value; stays MCP-only for agent workflow integration |
| `no-cli-dangerous` | Mutation, approval, archive, or destructive; never exposed to CLI without gating |

## Command Matrix

| Command | Disposition | Rationale |
|---|---|---|
| `/determinus-status` | `cli-bridge-primary` | Thin bridge over `adv status --no-color`; MCP kept for `view:"health"` |
| `/determinus-validate` | `mcp+cli-additive` | Gates/archive need MCP; CLI/CI verdict additive (deferred to C5) |
| `/determinus-audit` | `mcp+cli-additive` | Deterministic phase scan; additive CLI JSON output |
| `/determinus-slop-scan` | `mcp+cli-additive` | Deterministic detector phase; additive CLI JSON output |
| `/determinus-arch-scan` | `mcp+cli-additive` | Stack-pack phase scan; additive CLI JSON output |
| `/determinus-triage` | `agent-workflow-only` | Regenerates mirrors from GitHub Project; HITL-scoped |
| `/determinus-cleanup` | `agent-workflow-only` | Dry-run / approval-gated mutation; HITL-scoped |
| `/determinus-coordinate` | `agent-workflow-only` | Project-change and Epic-set audit plus approval-gated typed-tool mutation; HITL-scoped |
| `/determinus-reflect` | `agent-workflow-only` | Post-archive synthesis; agent workflow only |
| `/determinus-tron` | `agent-workflow-only` | Codebase reconnaissance; agent interpretation required |
| `/determinus-optimizer` | `agent-workflow-only` | Simplification proposal synthesis; agent interpretation required |
| `/determinus-improve` | `agent-workflow-only` | Improvement discovery; agent judgment required |
| `/determinus-comp-scan` | `agent-workflow-only` | Competitive intelligence; agent synthesis required |
| `/determinus-proposal` | `agent-workflow-only` | Gate workflow: proposal creation |
| `/determinus-idea` | `agent-workflow-only` | Pre-proposal ideation |
| `/determinus-problem` | `agent-workflow-only` | Pre-proposal triage |
| `/determinus-epic` | `agent-workflow-only` | Goal-first Epic creation; mutation remains typed-tool and HITL-scoped |
| `/determinus-backlog` | `agent-workflow-only` | Capture/promote future work; mutation remains typed-tool and HITL-scoped |
| `/determinus-clarify` | `agent-workflow-only` | Socratic requirements clarification |
| `/determinus-research` | `agent-workflow-only` | Research and plan validation |
| `/determinus-discover` | `agent-workflow-only` | Discovery gate workflow |
| `/determinus-design` | `agent-workflow-only` | Design gate workflow |
| `/determinus-prep` | `agent-workflow-only` | Planning gate workflow |
| `/determinus-apply` | `agent-workflow-only` | Execution gate workflow |
| `/determinus-task` | `agent-workflow-only` | Fast-track change creation |
| `/determinus-review` | `agent-workflow-only` | Acceptance gate workflow |
| `/determinus-harden` | `agent-workflow-only` | Production-readiness verification |
| `/determinus-archive` | `agent-workflow-only` | Release gate workflow |
| `/determinus-refactor` | `agent-workflow-only` | Stale proposal refresh |

## `bin/adv` Subcommand Boundary

| Subcommand | Boundary | Rationale |
|---|---|---|
| `adv status` | read-only | Live active-change table; no local service writes |
| `adv slop-scan` | read-only scanner | Deterministic scan/report only |
| `adv epic list` | read-only | Lists live Epic IDs from Temporal Visibility |
| `adv dashboard` | read-only local server | Serves configured state over loopback by default |
| `adv dashboard doctor` | read-only diagnostics | Checks service health and prints remediation |
| `adv dashboard install` | mutates local user state | Writes dashboard config/systemd unit and enables the user service; use `--dry-run` to preview |
| `adv reconcile` | operator-only plan/apply | Bundled disk-only reconciliation handler shared with `determinus_store_reconcile`; plan/dry-run emit `plan_hash`, apply requires matching approval and preserves typed refusal exit codes |

## Tool Matrix

| Tool | Disposition | Rationale |
|---|---|---|
| `determinus_status` | `mcp+cli-additive` | CLI table shipped; MCP kept for `view:"health"` depth |
| `determinus_backlog_add` | `no-cli-dangerous` | Backlog mutation |
| `determinus_backlog_list` | `keep-mcp-only` | Agent-facing backlog read |
| `determinus_backlog_show` | `keep-mcp-only` | Agent-facing backlog read |
| `determinus_backlog_promote` | `no-cli-dangerous` | Backlog promotion mutation |
| `determinus_backlog_archive` | `no-cli-dangerous` | Backlog archive mutation |
| `determinus_spec` | `mcp+cli-additive` | Agents query specs mid-workflow; CLI read additive |
| `determinus_change_list` | `mcp+cli-additive` | Agents need Temporal-first reads; CLI snapshot additive |
| `determinus_change_show` | `mcp+cli-additive` | Agents need Temporal-first reads; CLI snapshot additive |
| `determinus_change_validate` | `mcp+cli-additive` | Gates/archive need MCP; CLI/CI verdict additive (C5 path) |
| `determinus_doctor` | `no-cli-dangerous` | Infrastructure recovery; approval-gated safe-fix/verify entry, never exposed to ungated CLI |
| `determinus_snapshot_health` | `mcp+cli-additive` | CLI scan additive; repair remains approval-gated MCP-only |
| `determinus_store_consolidate` | `keep-mcp-only` | Ops recovery tool; scan/dry_run read-only, execute approval-gated |
| `determinus_store_cleanup` | `keep-mcp-only` | Maintenance-only legacy agenda cleanup; scan/dry_run read-only, execute approval-gated |
| `determinus_store_reconcile` | `mcp+cli-additive` | Operator-only MCP and `bin/adv reconcile` surfaces share the same plan/dry-run/apply handler and approval contract |
| `determinus_session_list` | `mcp+cli-additive` | Human inventory; additive CLI output |
| `determinus_worktree_triage` | `mcp+cli-additive` | Human inventory/report; additive CLI output |
| `determinus_tool_catalog` | `keep-mcp-only` | Bounded metadata read; agent/profile-author surface |
| `determinus_tool_describe` | `keep-mcp-only` | Single-tool schema/metadata read; agent/profile-author surface |
| `determinus_tool_invoke` | `keep-mcp-only` | Strict in-process dispatcher through the canonical wrapped `ToolDefinition.execute`; preserves ToolContext, validation, authorization, approvals, recovery restrictions, and timeouts. Recursion-exclusion (`determinus_tool_invoke`, `determinus_tool_catalog`, `determinus_tool_describe`, `execute`) is enforced before any lookup or dispatch (`addProviderToolSearch` AC1–AC4) |
| `determinus_conformance` | `mcp+cli-additive` | CLI read/CI verdict additive; init/lock/unlock/override remain MCP-gated |
| `determinus_task_show` | `keep-mcp-only` | Agent-workflow reads; low standalone CLI value |
| `determinus_task_list` | `keep-mcp-only` | Agent-workflow reads; low standalone CLI value |
| `determinus_task_ready` | `keep-mcp-only` | Agent-workflow reads; low standalone CLI value |
| `determinus_gate_status` | `keep-mcp-only` | Agent reads constantly during workflow |
| `determinus_wisdom_list` | `keep-mcp-only` | Agent knowledge surface |
| `determinus_project_context` | `keep-mcp-only` | Agent context read |
| `determinus_project_metadata` | `keep-mcp-only` | Agent context read |
| `determinus_wip_state` | `keep-mcp-only` | Temporal/session-dependent aggregation |
| `determinus_reflection_list` | `keep-mcp-only` | Agent knowledge surface |
| `determinus_reflect` | `keep-mcp-only` | Workflow-bound reflection tool |
| `determinus_resume_projection` | `mcp+cli-additive` | Pure-read dependency-aware next-work projection; CLI status/epic-list/dashboard consume it |
| `determinus_run_test` | `keep-mcp-only` | Workflow-bound test evidence tool |
| `determinus_task_checkpoint` | `keep-mcp-only` | Workflow-bound checkpoint tool |
| `determinus_subagent_report_submit` | `keep-mcp-only` | Workflow-bound report ingestion |
| `determinus_lightweight_profile_evaluate` | `keep-mcp-only` | Workflow-bound gate evaluation signal tool |
| `determinus_change_set_worker_bundle_impact` | `keep-mcp-only` | Planning-time worker-bundle applicability declaration; workflow-bound signal |
| `determinus_worker_bundle_provenance_record` | `keep-mcp-only` | Execution-time build+replay provenance receipt; workflow-bound signal |
| `determinus_worktree_cleanup` | `keep-mcp-only` | Preview MCP-side; mutation approval-gated |
| `determinus_change_create` | `no-cli-dangerous` | Change mutation |
| `determinus_change_update` | `no-cli-dangerous` | Change mutation |
| `determinus_change_close` | `no-cli-dangerous` | Change mutation |
| `determinus_followup_promote` | `no-cli-dangerous` | Promotes a linked ops follow-up change; mutation |
| `determinus_ops_evidence_add` | `no-cli-dangerous` | Appends ops evidence and updates follow-up status; mutation |
| `determinus_ops_followup_resolution_upsert` | `no-cli-dangerous` | Persists verified child-state proof onto a parent ops follow-up link; release/archive authority mutation |
| `determinus_change_bulk_close` | `no-cli-dangerous` | Change mutation |
| `determinus_change_archive` | `no-cli-dangerous` | Archive mutation + spec delta |
| `determinus_archive_purge` | `no-cli-dangerous` | Operator-only archived-change purge; terminates workflow, opt-in disk-bundle removal |
| `determinus_change_workflow_terminate` | `no-cli-dangerous` | Operator-only pinned wedged-workflow termination; run pinned via describe, shipped-gate eligibility |
| `determinus_change_update_issues` | `no-cli-dangerous` | Issue linkage mutation |
| `determinus_change_repair_origin` | `no-cli-dangerous` | Origin-linkage repair mutation |
| `determinus_change_projection_quarantine` | `no-cli-dangerous` | Quarantine of corrupt/oversized active change projection; operator-only approval-gated |
| `determinus_change_reenter` | `no-cli-dangerous` | Change state mutation |
| `determinus_task_add` | `no-cli-dangerous` | Task mutation |
| `determinus_task_update` | `no-cli-dangerous` | Task mutation |
| `determinus_task_cancel` | `no-cli-dangerous` | Task mutation |
| `determinus_task_reclassify_tdd` | `no-cli-dangerous` | Task mutation |
| `determinus_gate_complete` | `no-cli-dangerous` | Gate completion + workflow advance |
| `determinus_contract_mint` | `no-cli-dangerous` | Contract authority mutation |
| `determinus_contract_review_matrix_set` | `no-cli-dangerous` | Contract authority mutation |
| `determinus_design_concern_disposition` | `no-cli-dangerous` | Contract authority mutation |
| `determinus_verification_evidence_disposition` | `no-cli-dangerous` | Contract authority mutation |
| `determinus_ops_run_upsert` | `no-cli-dangerous` | Ops runbook state mutation |
| `determinus_ops_run_evidence_add` | `no-cli-dangerous` | Ops run evidence mutation |
| `determinus_worktree_create` | `no-cli-dangerous` | Worktree mutation |
| `determinus_worktree_detach` | `no-cli-dangerous` | Operator-only nonterminal worktree directory detach; preserves branch and change record |
| `determinus_worktree_resume` | `no-cli-dangerous` | Worktree mutation |
| `determinus_worktree_delete` | `no-cli-dangerous` | Worktree mutation |
| `determinus_wisdom_add` | `no-cli-dangerous` | Wisdom mutation |
| `determinus_epic_create` | `no-cli-dangerous` | Epic mutation |
| `determinus_epic_show` | `keep-mcp-only` | Agent-workflow read |
| `determinus_epic_list` | `mcp+cli-additive` | MCP remains the rich agent-workflow read; `bin/adv epic list --json` exposes reduced live ID-only Visibility enumeration |
| `determinus_epic_update` | `no-cli-dangerous` | Epic mutation |
| `determinus_epic_add_shell` | `no-cli-dangerous` | Epic mutation |
| `determinus_epic_promote_shell` | `no-cli-dangerous` | Epic mutation |
| `determinus_epic_link_change` | `no-cli-dangerous` | Epic mutation |
| `determinus_epic_unlink_change` | `no-cli-dangerous` | Epic mutation |
| `determinus_epic_move_change` | `no-cli-dangerous` | Epic membership mutation across Epics |
| `determinus_epic_reorder` | `no-cli-dangerous` | Epic mutation |
| `determinus_epic_retire` | `no-cli-dangerous` | Epic retirement mutation |
| `determinus_launcher_projection_rebuild` | `keep-mcp-only` | Producer-only aggregate launcher-projection rebuild (drift recovery); plugin/MCP-only, never bin/adv |
| `determinus_change_set_worker_bundle_impact` | `keep-mcp-only` | Workflow-bound planning declaration of worker-bundle impact classification; agent/orchestrator use only |
| `determinus_worker_bundle_provenance_record` | `keep-mcp-only` | Execution-time worker-bundle build+replay provenance receipt; agent/orchestrator use only |

## Deferred

- `adv validate` and `adv doctor` are NOT implemented in this change (AC8).
  The validate disk-vs-Temporal architecture decision is deferred to a
  follow-up `/determinus-design` research task.

## Removed Tools

`determinus_backlog_state`, `determinus_project_wisdom_list`, `determinus_gate_criteria`,
`determinus_epic_update_scope`, `determinus_epic_merge`, and `determinus_roadmap` were removed
completely; none has a current CLI or MCP surface. Replacement paths:
`determinus_change_list status: 'in-flight'` + `determinus_epic_show` for backlog/roadmap
read (post portfolio-balance reshape), and `determinus_wisdom_list` with
`project_only: true` for project wisdom (bounded by `maxEntries` after
filtering). The three latent tools (`determinus_backlog_state`,
`determinus_project_wisdom_list`, `determinus_gate_criteria`) have no agent-callable
replacement. `determinus_roadmap` was retired by `reshapeTriagePortfolioBalance`
in favor of `/determinus-triage` portfolio-balance output; CLI subcommand
`adv roadmap`, command `/determinus-roadmap`, and lib `bin/lib/roadmap.ts` were
removed in the same change. Full mapping: `docs/tool-ownership.md` →
Removed Tools and Replacements.
