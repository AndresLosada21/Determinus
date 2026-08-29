# OpenCode V2 Routing

Recommended graph:

```text
orchestrator [primary]
├── product-owner [all]
├── project-manager [all]
└── engineer [all]
    ├── explorer
    ├── researcher
    ├── modeler
    ├── engineering-planner
    ├── tester
    ├── implementer
    ├── verifier
    ├── debugger
    ├── reviewer
    ├── security-reviewer
    ├── integrator
    └── documenter
```

For OpenCode V2 beta use:

```json
{
  "default_agent": "orchestrator",
  "experimental": {
    "subagent_depth": 2
  }
}
```

V2's migration guide explicitly places nested subagent depth under `experimental.subagent_depth`.
Depth 2 enables `orchestrator → engineer → specialist`.

The top-level plane agents use `mode: all`, so the human can also select them directly.

Do not allow technical specialists to recursively orchestrate other agents. Centralize engineering orchestration in
`engineer` and cross-plane orchestration in `orchestrator`.
