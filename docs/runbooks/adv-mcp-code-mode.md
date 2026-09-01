# Runbook: ADV Code Mode MCP read surface (global config)

> Applied **post-merge, from merged trunk** (never from a worktree — P32). This
> runbook installs the ADV Code Mode calling-convention instruction into global
> OpenCode config and corrects two stale `opencode.jsonc` allowlist entries. It
> mirrors how `lgrep-tools.md` is maintained: a global instruction in
> `~/.config/opencode/instructions/`, backed up to `backups/dotfiles/`, **not**
> repo-deployed (`scripts/deploy-local.sh` only mirrors `skills/` → global and
> actively strips determinus-scoped global instructions).

## Background

ADV ships two tool surfaces:

1. **Host plugin tools** (`determinus_*`) — ~84 tools registered via
   `plugin/src/tool-registry.ts`, called as top-level `determinus_*` tools.
2. **Tier-4 Code Mode MCP tools** (`tools.adv.*`) — 13 READ tools also exposed
   via the ADV MCP server (`plugin/src/mcp-server/`, Vision server `determinus-advance`
   on port 6298, `mcp.adv` wired per-project). Under OpenCode Code Mode (default
   for `oc`-launched sessions) these are **not** top-level tools — they are
   called as `tools.adv.<tool>` inside the `execute` tool, exactly like
   `tools.lgrep.*`.

Agents need an always-on instruction (like `lgrep-tools.md`) telling them HOW to
call the Tier-4 surface under Code Mode. Without it, the shipped split is
invisible and agents misuse or ignore `tools.adv.*`.

---

## Part 1 — Install the `determinus-tools.md` global instruction

### 1a. Copy this content to `~/.config/opencode/instructions/determinus-tools.md`

```markdown
# ADV Tool Calling Convention (Host Plugin vs Code Mode MCP)

Always-on policy: distinguish ADV's two tool surfaces and call each correctly
under OpenCode Code Mode. Mirrors the `lgrep-tools.md` convention.

## Two surfaces

| Surface | Names | How to call | Where defined |
|---|---|---|---|
| Host plugin tools | `determinus_*` (~84) | top-level `determinus_*` tool calls | `plugin/src/tool-registry.ts` |
| Tier-4 Code Mode MCP | `tools.adv.*` (13 reads) | inside the `execute` tool | `plugin/src/mcp-server/` (Vision `determinus-advance`, port 6298) |

The 13 Tier-4 read tools are ALSO registered as host `determinus_*` tools; the split is
additive, not subtractive. Both surfaces dispatch to the same handlers.

## Calling convention (Code Mode-aware)

Code Mode is ON by default for `oc`-launched sessions
(`OPENCODE_EXPERIMENTAL_CODE_MODE=true`). It changes HOW ADV read tools are
invoked, not WHETHER they are preferred.

- **Code Mode ON (default):** the 13 Tier-4 read tools are NOT top-level. Call
  them inside the `execute` tool as `tools.adv.<tool>(input)`. If the signature
  is not shown in the Code Mode catalog, discover it first with
  `tools.$codemode.search({ query: "<intent>", namespace: "adv" })`, then copy
  the returned path exactly. Example:
  `return await tools.adv.status({ scope: "repo" })`.
- **Code Mode OFF** (`OC_DISABLE_CODE_MODE=1`, or a non-`oc` launch): the host
  `determinus_*` tools are the only ADV surface (top-level). There is no `tools.adv.*`
  namespace.
- The orchestrator/main agent can use top-level `determinus_*` tools. A spawned agent
  can use only the host `determinus_*` tools injected into its session and granted by
  its manifest. Any Code Mode context whose catalog exposes the `adv` namespace
  can use `tools.adv.*` for reads.

## Tier-4 read catalog

Backlog and Epic list/show are MCP Tier-4 reads bridged by
`plugin/src/mcp-server/tier4-tool-map.ts`. Under Code Mode, reach them through
`tools.adv.*`; they are not host `determinus_*` tools. Their dispositions use the
`keep-mcp-only` and `mcp+cli-additive` vocabulary from the CLI surface matrix.

| Read | Host surface / disposition | MCP name (`tools.adv.*`) |
|---|---|---|
| Project status | `determinus_status` | `tools.adv.status` |
| Specs (list/show/search) | `determinus_spec` | `tools.adv.spec` |
| Wisdom list/search | `determinus_wisdom_list` | `tools.adv.wisdom_list` |
| Reflection list | `determinus_reflection_list` | `tools.adv.reflection_list` |
| Project context (project.md) | `determinus_project_context` | `tools.adv.project_context` |
| Backlog list | `keep-mcp-only` (MCP, not host) | `tools.adv.backlog_list` |
| Backlog show | `keep-mcp-only` (MCP, not host) | `tools.adv.backlog_show` |
| Epic list | `mcp+cli-additive` (MCP, not host) | `tools.adv.epic_list` |
| Epic show | `keep-mcp-only` (MCP, not host) | `tools.adv.epic_show` |
| Work-in-progress state | `determinus_wip_state` | `tools.adv.wip_state` |
| Worktree triage | `determinus_worktree_triage` | `tools.adv.worktree_triage` |
| Tool catalog / describe | `determinus_tool_catalog` / `determinus_tool_describe` | `tools.adv.tool_catalog` / `tools.adv.tool_describe` |

`determinus_handshake` is **MCP-only** (not a host tool): it returns the Tier-4
inventory and the ADV contract version — use it to probe capabilities:
`return await tools.adv.determinus_handshake({})`.

## Degradation

The MCP server degrades gracefully per tool classification
(`plugin/src/mcp-server/degradation.ts`): `needs-temporal` tools fall back to
disk-only state when Temporal is unreachable; `needs-host-probe`/`needs-host-git`
tools skip host-only enrichment. A degraded result is still returned with a
degradation marker — do not retry blindly.

## When to use which surface

- Inside `execute` (Code Mode) and you only need a READ listed above → use
  `tools.adv.<tool>` (cheaper; no host-plugin tool-schema weight).
- Mutations (`determinus_change_*` writes, `determinus_task_*` writes, `determinus_gate_complete`,
  archives, etc.) → host `determinus_*` tools only (Tier-4 is READ-only by design).
- `execute` not exposed (host-plugin session) → top-level `determinus_*` for everything.

## Anti-Patterns (Do NOT Do These)

- Do NOT call `tools.adv.<tool>` as a top-level tool when Code Mode is on; use it
  inside `execute`.
- Do NOT attempt mutations via `tools.adv.*` — the Tier-4 surface is read-only;
  the MCP server rejects mutation-shaped args (`security.ts`).
- Do NOT assume a particular `determinus_*` host tool exists in a spawned sub-agent;
  inspect its manifest/surface. Likewise, use `tools.adv.*` only when the Code
  Mode catalog exposes the `adv` namespace (see `docs/agent-tool-contracts.md`).
- Do NOT confuse the `adv` MCP namespace with the `determinus_*` host tool prefix.
```

### 1b. Register it in `opencode.jsonc`

In `~/.config/opencode/opencode.jsonc`, add `determinus-tools.md` to the `instructions`
array (alongside the existing `lgrep-tools.md` etc.):

```jsonc
"instructions": [
  "AGENTS.md",
  "~/.config/opencode/instructions/morph-tools.md",
  "~/.config/opencode/instructions/lgrep-tools.md",
  "~/.config/opencode/instructions/determinus-tools.md",   // <-- ADD
  "~/.config/opencode/instructions/oc-test-gate.md",
  "~/.config/opencode/instructions/oc-ci-wait.md",
  "~/.config/opencode/instructions/trunk-worktree-isolation.md",
  "~/.config/opencode/instructions/rules.yaml"
],
```

### 1c. Back up + restart

```bash
# Sync the non-secret current state into the dotfiles backup (global AGENTS.md convention).
cp ~/.config/opencode/instructions/determinus-tools.md ~/toolbox/backups/dotfiles/.../determinus-tools.md
# Restart OpenCode so the new instruction loads into every agent prompt.
```

---

## Part 2 — `opencode.jsonc` allowlist fixes

Two stale entries in `~/.config/opencode/opencode.jsonc`:

### 2a. Remove retired `determinus_agenda_list` (determinus-visual-review)

`determinus_agenda_list` was tombstoned (agenda retirement). Remove this line from the
`determinus-visual-review` permission block (~line 247):

```jsonc
// DELETE:
"determinus_agenda_list": "allow",
```

### 2b. Remove `determinus_change_list` Tier-2 leakage (determinus-researcher)

Per `plugin/src/tool-role-policy.ts`, `determinus_change_list` is Tier-2
(orchestrator-only top-level). It currently leaks into the `determinus-researcher`
allowlist (~line 307), whose policy is "Tier-1 surface only". Remove it:

```jsonc
// DELETE (determinus-researcher block, ~line 307):
"determinus_change_list": "allow",
```

The researcher retains read access to changes via `determinus_tool_invoke` and the
Tier-4 MCP surface (`tools.adv.*` is not governed by the host `determinus_*: deny`
rule).

### 2c. Related observation (operator decision — NOT auto-applied)

A related-scan (P25) found `determinus_change_list` **also** appears in two other
sub-agent allowlists: `determinus-visual-review` (~line 243) and `determinus-reviewer`
(~line 326). For reviewers/visual-review, listing changes is a legitimate read,
so these are plausibly intentional. **Decision for the operator:** if
`determinus_change_list` should be uniformly Tier-2 (orchestrator-only), remove it from
those two blocks as well and regenerate manifests; if reviewers legitimately need
it, leave them and instead widen the policy classification. This runbook applies
only the agreed fix (2b, determinus-researcher); the operator evaluates 2c separately.

---

## Verification (post-apply)

```bash
# 1. Instruction registered:
jq '.instructions' ~/.config/opencode/opencode.jsonc | grep determinus-tools.md
# 2. Stale entries gone:
! grep -n 'determinus_agenda_list' ~/.config/opencode/opencode.jsonc
! grep -n '"determinus_change_list": "allow"' ~/.config/opencode/opencode.jsonc   # determinus-researcher line removed
# 3. Dotfiles backup present:
ls -la ~/toolbox/backups/dotfiles/.../determinus-tools.md
# 4. After restart, the `adv` MCP server still serves (sanity):
curl -s http://localhost:6298/mcp -X POST -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq '.result.tools | length'   # expect 14
```

## Rollback

Remove `determinus-tools.md` from the `instructions` array and delete the file; restore
the two allowlist lines from the dotfiles backup. The repo code/manifests are
unaffected (this runbook only touches global config).
