# AI-Driven Product Delivery for OpenCode V2

A multi-plane agent organization for Product, Delivery, and Engineering with explicit contracts and evidence gates.

Works with [OpenCode V2](https://opencode.ai/v2/docs/) (`opencode2`). Supports coexistence with `build` and `plan` — this package sets `orchestrator` as default without disabling built-in agents.

## How it works

```
Human intent
  -> Product Owner  (WHY / WHAT)       -> .ai/product-contract.md
  -> Project Manager (WHEN / ORDER)    -> .ai/delivery-contract.md
  -> Engineering Lead (HOW / EVIDENCE) -> .ai/engineering-contract.md
     -> specialists (explorer, planner, tester, implementer, verifier, reviewer, ...)
  -> Acceptance: Engineering -> Delivery -> Product -> Global Done
```

Ceremony scales with risk: trivial fixes go straight through `engineer`; cross-cutting features use the full contract flow. See `skills/ai-driven-engineering/SKILL.md` for the full lifecycle.

## Organization

```
orchestrator                      Coordination — handoffs, gates, final status
├── product-owner                 Product — outcome, scope, acceptance criteria
├── project-manager               Delivery — dependencies, waves, readiness
└── engineer                      Engineering Lead — technical contract & orchestration
    ├── explorer                  Repository and runtime discovery
    ├── researcher                External and internal research
    ├── modeler                   Architecture and change-impact model
    ├── engineering-planner       Work decomposition
    ├── tester                    Executable specification
    ├── implementer               Implementation
    ├── verifier                  Independent validation
    ├── debugger                  Root-cause analysis
    ├── reviewer                  Correctness review
    ├── security-reviewer         Security review
    ├── integrator                Integration readiness
    └── documenter                Technical documentation
```

The `engineer` delegates implementation to specialists so planning, building, and verification stay independent.

## Contracts

```
.ai/
├── product-contract.md        Owned by product-owner
├── delivery-contract.md       Owned by project-manager
├── engineering-contract.md    Owned by engineer
├── checkpoint.md              Delivery status
└── decision-log.md            Cross-plane decisions
```

- **Product Contract** — problem, outcome, value, stakeholders, scope, acceptance criteria, authorization.
- **Delivery Contract** — work graph, dependencies, waves, risks, gates, delivery state.
- **Engineering Contract** — current system, technical scope, architecture impact, write surfaces, validation plan.

Templates live in `skills/ai-driven-engineering/templates/`.

## Triple Definition of Done

```
ENGINEERING_ACCEPTED
      + DELIVERY_ACCEPTED
      + PRODUCT_ACCEPTED
      = GLOBAL DONE
```

Each plane owns its gate. Partial states (`ENGINEERING_ACCEPTED / DELIVERY_PENDING`, `BLOCKED`, etc.) are reported explicitly.

## Requirements

- OpenCode V2 (`opencode2`) — [installation](https://opencode.ai/v2/docs/)
- PowerShell 5.1+ / PowerShell 7+ (Windows) or `pwsh` (macOS/Linux)

## Install

From the package root:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-opencode.ps1
```

What it does:

1. Copies agents to `~/.config/opencode/agents/`
2. Copies the skill to `~/.config/opencode/skills/ai-driven-engineering/`
3. Backs up `opencode.json` / `opencode.jsonc` with a timestamp
4. Sets `default_agent: "orchestrator"`
5. Sets `experimental.subagent_depth: 2` (required for `orchestrator -> engineer -> specialist`)
6. Preserves providers, models, and MCP definitions

Options:

```powershell
# Agents and skill only, no config changes
.\install-opencode.ps1 -NoConfigPatch

# Keep your current default agent
.\install-opencode.ps1 -NoDefaultAgent
```

Restart OpenCode after install so discovery reloads the new agents and skill.

To remove:

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall-opencode.ps1
```

## Project bootstrap

Initialize contract templates in any project:

```powershell
powershell -ExecutionPolicy Bypass -File <package>\scripts\bootstrap-project.ps1
# Overwrite existing .ai files
powershell -ExecutionPolicy Bypass -File <package>\scripts\bootstrap-project.ps1 -Force
```

Creates `.ai/` without overwriting existing files by default.

## OpenCode V2 routing

End-to-end nesting requires depth 2:

```
orchestrator (primary)
  -> engineer (child)
    -> specialist (grandchild)
```

```json
{
  "experimental": {
    "subagent_depth": 2
  }
}
```

`product-owner`, `project-manager`, and `engineer` use `mode: all` and can be selected directly. `orchestrator` is `mode: primary`; specialists are `mode: subagent`.

## Built-in agents

This package does not disable `build` or `plan`. Both remain available — switch agents in the TUI or set `default_agent` back to `build` if preferred. See the [Agents guide](https://opencode.ai/v2/docs/agents).

## Models and MCPs

Provider and MCP configuration is not modified. Model selection and MCP routing are adapters on top of the organization and can be tuned per role without changing contracts.

## Uninstall

Removes installed agents and skill. Config keys are not reverted automatically — restore from the timestamped backup if needed.

## License

MIT — see [LICENSE](LICENSE).
