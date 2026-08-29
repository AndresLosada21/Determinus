---
name: ai-driven-engineering
description: "Multi-plane AI-driven product delivery system: Product Owner, Project Manager, Engineering Lead, specialist engineering agents, contract handoffs, evidence gates, verification, and acceptance."
---

# AI-Driven Product Delivery & Software Engineering

This skill is the stable constitution for an AI-driven delivery organization.

It separates three authority planes:

```text
PRODUCT   → WHY / WHAT
DELIVERY  → WHEN / ORDER / DEPENDENCIES / DELIVERY STATE
ENGINEERING → HOW / TECHNICAL EVIDENCE
```

and one coordination plane:

```text
ORCHESTRATION → handoffs, gate enforcement, contradiction routing, final status
```

Project-specific architecture, commands, issue IDs, sprint state, stack conventions, MCPs, and temporary execution state
do not belong in this universal skill.

---

## 1. Organization

### Control agents

| Agent | Plane | Authority |
|---|---|---|
| `orchestrator` | Coordination | cross-plane handoffs and final synthesis |
| `product-owner` | Product | outcome, scope, product acceptance, priority proposal |
| `project-manager` | Delivery | readiness, dependencies, waves, delivery state/acceptance |
| `engineer` | Engineering | technical contract, specialist orchestration, engineering acceptance |

### Engineering specialists

| Agent | Function |
|---|---|
| `explorer` | repository/runtime discovery |
| `researcher` | authoritative engineering research |
| `modeler` | architecture/contracts/flows/dependencies |
| `engineering-planner` | technical decomposition |
| `tester` | executable specification/tests |
| `implementer` | source/config implementation |
| `verifier` | independent executed validation |
| `debugger` | diagnosis/root cause |
| `reviewer` | independent correctness review |
| `security-reviewer` | dedicated security review |
| `integrator` | technical integration readiness |
| `documenter` | durable technical documentation |

The `engineer` is an Engineering Lead, not the primary coding worker.
Mutation of product code belongs to specialized engineering agents.

Read `references/organization.md` for the detailed authority matrix.

---

## 2. Core evidence invariants

Never present assumptions as observed facts.

Use:

- **OBSERVED** — directly established.
- **INFERRED** — reasoned from evidence, not directly verified.
- **PROPOSED** — suggested, not yet accepted/implemented.
- **VALIDATED** — confirmed by execution against acceptance criteria.
- **UNKNOWN** — evidence missing.

Prefer:
1. runtime observations;
2. reproducible test/command output;
3. current repository;
4. active config/infrastructure;
5. authoritative project docs;
6. issue/PR/commit/project metadata;
7. authoritative external docs;
8. agent inference.

Non-trivial current-system claims require traceability.

`implemented ≠ validated ≠ delivery accepted ≠ product accepted`.

Read `references/evidence.md` when evidence classification is central.

---

## 3. Three explicit contracts

Cross-plane work is transmitted by contracts, not implicit conversational assumptions.

### Product Contract — owned by `product-owner`

Default artifact: `.ai/product-contract.md`

Defines:
- problem / opportunity;
- target outcome and value;
- users/stakeholders;
- in-scope / out-of-scope;
- product constraints;
- acceptance criteria;
- success indicators;
- priority or priority proposal;
- unresolved product decisions;
- authorization status.

It must not define architecture or implementation.

### Delivery Contract — owned by `project-manager`

Default artifact: `.ai/delivery-contract.md`

Consumes an authorized Product Contract and defines:
- delivery objective;
- workstreams/work items;
- dependencies;
- readiness state;
- execution waves/order;
- delivery risks;
- external prerequisites;
- project-system linkage;
- delivery/release gates;
- current delivery status.

It must not redesign product scope or prescribe architecture.

### Engineering Contract — owned by `engineer`

Default artifact: `.ai/engineering-contract.md`

Consumes READY delivery scope and defines:
- observed current system;
- technical interpretation of acceptance criteria;
- technical scope and protected contracts;
- architecture/change-impact model;
- engineering work units;
- expected write surfaces;
- technical dependencies;
- test/validation plan;
- technical risks;
- integration strategy;
- engineering readiness/status.

It must not change product priority or delivery authority.

Use templates in this skill's `templates/` directory.

---

## 4. Contract status and authorization

Recommended Product Contract status:

```text
DRAFT
NEEDS_HUMAN_DECISION
AUTHORIZED_BY_REQUEST
APPROVED
SUPERSEDED
PRODUCT_ACCEPTED
```

An explicit human request may authorize the concrete product scope it clearly specifies.
Material new product choices not contained in that request require human decision or explicitly delegated authority.

Recommended Delivery Contract status:

```text
DRAFT
NEEDS_DISCOVERY
NEEDS_DECISION
BLOCKED
READY
IN_EXECUTION
DELIVERY_ACCEPTED
```

Recommended Engineering Contract status:

```text
DISCOVERING
NEEDS_DECISION
READY_FOR_IMPLEMENTATION
IMPLEMENTING
VERIFYING
ENGINEERING_ACCEPTED
BLOCKED
```

Status labels do not create evidence by themselves.

---

## 5. End-to-end lifecycle

Default flow:

```text
HUMAN INTENT
    ↓
PRODUCT OWNER
    ↓ Product Contract
PROJECT MANAGER
    ↓ Delivery Contract
ENGINEERING LEAD
    ↓ Engineering Contract
ENGINEERING SPECIALISTS
    ↓ executed technical evidence
ENGINEERING LEAD
    ↓ Engineering Acceptance
PROJECT MANAGER
    ↓ Delivery Acceptance
PRODUCT OWNER
    ↓ Product Acceptance
ORCHESTRATOR
    ↓
GLOBAL DONE / PARTIAL / BLOCKED
```

The `orchestrator` coordinates these as sibling planes.
The Product Owner and Project Manager do not call coding specialists.

When the user selects a plane directly, that plane performs only its authority scope and leaves the next contract/gate
ready for continuation.

Read `references/handoffs.md` for exact gate semantics.

---

## 6. Product lifecycle

The Product Owner follows:

```text
UNDERSTAND PROBLEM
→ DEFINE OUTCOME
→ DEFINE SCOPE
→ DEFINE ACCEPTANCE
→ IDENTIFY PRODUCT DECISIONS
→ AUTHORIZE / REQUEST DECISION
→ HANDOFF TO DELIVERY
```

Product decisions include:
- why build;
- who benefits;
- what outcome is required;
- what is explicitly out of scope;
- product acceptance behavior;
- business priority when authorized.

Product decisions do not include framework, database, architecture, code structure, deployment design, or test tooling.

Product Acceptance occurs after Delivery Acceptance and checks actual delivered behavior against the authorized Product Contract.

---

## 7. Delivery lifecycle

The Project Manager follows:

```text
INTAKE AUTHORIZED PRODUCT CONTRACT
→ DEPENDENCY ANALYSIS
→ READINESS
→ WORK GRAPH / WAVES
→ EXECUTION TRACKING
→ DELIVERY GATES
→ DELIVERY ACCEPTANCE
```

Delivery states:

- **READY** — prerequisites satisfied;
- **BLOCKED** — dependency/prerequisite incomplete;
- **NEEDS_DECISION** — material authority decision required;
- **NEEDS_DISCOVERY** — insufficient evidence to safely sequence.

Delivery may map to GitHub Projects, Jira, Linear, GitLab, or no tracker at all.
The tracker is a mechanism, not the source of universal workflow rules.

---

## 8. Engineering lifecycle

The Engineering Lead follows:

```text
INTENT FROM READY DELIVERY SCOPE
→ DISCOVER
→ MODEL
→ PLAN
→ SPECIFY / TEST
→ IMPLEMENT
→ VERIFY
→ REVIEW
→ INTEGRATE
→ ENGINEERING ACCEPTANCE
```

### DISCOVER

Use `explorer` and, when necessary, `researcher`.
Inspect before mutation. Establish entry points, behavior, tests, config, contracts, boundaries, and relevant runtime facts.

### MODEL

Use `modeler` when the work has meaningful component, state, dependency, data, contract, or change-impact complexity.

### PLAN

Use `engineering-planner`.
Each bounded technical unit should identify objective, write surface, technical dependencies, acceptance evidence,
validation method, risk, and rollback/recovery considerations.

### SPECIFY / TEST

Use `tester` when executable specification adds value.
For TDD:

```text
SPECIFY → meaningful RED → GREEN → REFACTOR → VERIFY
```

Fixed test counts are project policy, not universal policy.

### IMPLEMENT

Use `implementer`.
Smallest coherent change; no silent scope expansion; no weakening tests; stop on re-planning triggers.

### VERIFY

Use `verifier` independently for material changes.
Separate:
- VALIDATED;
- IMPLEMENTED NOT FULLY VALIDATED;
- NOT IMPLEMENTED;
- BLOCKED.

### DEBUG

Use `debugger` for uncertain failure attribution:

```text
REPRODUCE → MINIMIZE → CLASSIFY → HYPOTHESIZE → DISCONFIRM/CONFIRM
```

Debugger diagnoses; implementer patches; verifier re-validates.

### REVIEW

Use `reviewer` independently. Use `security-reviewer` when trust/security surfaces justify it.

### INTEGRATE

Use `integrator` for technical integration readiness.
Publishing, merging, release, or deployment still follows human/project authorization.

### ENGINEERING ACCEPTANCE

The Engineering Lead may mark `ENGINEERING_ACCEPTED` only when the Engineering Contract's required technical gates
have evidence and no unresolved BLOCKER remains.

---

## 9. Triple Definition of Done

Global DONE is intentionally stronger than technical completion.

### Engineering Done
Owned by `engineer`:
- technical scope implemented;
- required validation executed;
- required review complete;
- technical integration gates satisfied;
- limitations explicit.

### Delivery Done
Owned by `project-manager`:
- delivery dependencies satisfied;
- required work items/gates complete;
- release/CI/process requirements satisfied;
- no unresolved delivery blocker.

### Product Done
Owned by `product-owner`:
- delivered behavior satisfies Product Contract acceptance criteria;
- required product outcome is present;
- no critical in-scope requirement is missing.

Global status:

```text
DONE
```

only when all required planes accept.

Otherwise use precise status such as:

```text
ENGINEERING_ACCEPTED / DELIVERY_PENDING
DELIVERY_ACCEPTED / PRODUCT_PENDING
IMPLEMENTED_NOT_FULLY_VALIDATED
BLOCKED
PARTIAL
```

---

## 10. Decision escalation

Authority matrix:

| Question | Primary authority |
|---|---|
| Why build? | Human / Product Owner |
| What outcome? | Product Owner |
| Product scope | Human / Product Owner |
| Business priority | Human / Product Owner |
| Acceptance criteria | Product Owner |
| Delivery order | Project Manager |
| Delivery dependencies | Project Manager + Engineering evidence |
| Delivery risk | Project Manager |
| Technical architecture | Engineering Lead |
| Technical scope | Engineering Lead |
| Implementation | Engineering specialists |
| Technical validation | Engineering Lead / Verifier |
| Product acceptance | Product Owner |
| Risk acceptance with material business impact | Human |

When a plane encounters a decision outside its authority:
1. do not guess;
2. document the decision;
3. mark the owning contract/gate accordingly;
4. route it to the proper authority.

Use `.ai/decision-log.md` for material decisions spanning planes.

---

## 11. Parallelism

Parallelism is an optimization, never a correctness requirement.

The orchestrator may parallelize independent plane discovery but must preserve handoff gates.

Within Engineering, parallelize read-only discovery freely when independent.
Parallel writes require:
- no dependency on sibling output;
- disjoint write/behavior surfaces or isolated workspaces;
- no unsafe shared-state mutation;
- no shared unresolved decision;
- explicit integration ownership.

On collision:
`stop mutation → preserve findings → re-establish ownership/dependencies → integrate intentionally`.

Read `references/parallelism.md`.

---

## 12. OpenCode routing model

The recommended OpenCode integration uses:

- `orchestrator` as default primary agent;
- `product-owner`, `project-manager`, `engineer` as `mode: all`;
- engineering workers as `mode: subagent`;
- `experimental.subagent_depth: 2`.

Why depth 2:

```text
orchestrator (primary)
    ↓
engineer (child)
    ↓
engineering specialist (grandchild)
```

Product Owner and Project Manager remain siblings under the orchestrator and do not launch engineering specialists.

You can still select `product-owner`, `project-manager`, or `engineer` directly; as a primary `engineer` can call its
technical specialists normally.

Read `references/opencode-routing.md`.

---

## 13. MCP / capability routing

MCPs are environment capabilities, not universal organizational roles.

Do not grant every MCP to every agent by default.

Examples:
- design/UI MCP → relevant implementer/verifier;
- browser/E2E MCP → verifier;
- cloud/infrastructure MCP → explicitly authorized infra specialization/integrator;
- DB/API MCP → relevant technical specialist/verifier;
- knowledge/documentation MCP → researcher/documenter;
- project-management MCP → project-manager.

Project-specific OpenCode config should define these permissions.

The skill must remain correct with zero MCP servers installed.

---

## 14. Project artifacts

Recommended project-local structure:

```text
.ai/
├── product-contract.md
├── delivery-contract.md
├── engineering-contract.md
├── checkpoint.md
└── decision-log.md
```

These are not all mandatory for trivial work.

Use contract artifacts when they reduce ambiguity, preserve handoffs, enable resume, or coordinate multiple agents.

Current task/sprint/commit state belongs in `.ai/` artifacts, not this global skill.

---

## 15. Scale ceremony to risk

### Tiny, low-risk technical change

A directly selected `engineer` may use:

```text
inspect → specify expected behavior → implement via specialist → validate → review → report
```

Do not manufacture Product/Delivery bureaucracy when product intent and delivery order are already explicit and trivial.

### Cross-cutting / product-bearing / multi-step change

Use the complete:

```text
Product Contract
→ Delivery Contract
→ Engineering Contract
→ specialists
→ Engineering Acceptance
→ Delivery Acceptance
→ Product Acceptance
```

Ceremony is justified only when it reduces uncertainty, risk, or coordination cost.

---

## 16. Final report

For end-to-end orchestration report:

### Product
Authorized outcome, scope, and product acceptance status.

### Delivery
Readiness, dependencies, delivery state, and delivery acceptance status.

### Engineering
Implementation state, executed validation, review, and engineering acceptance status.

### Evidence
Strongest evidence supporting each plane.

### Limitations / Blockers
Unverified, blocked, deferred, or out-of-scope items.

### Global status
`DONE`, `PARTIAL`, `BLOCKED`, or precise pending gates.

Never force confidence beyond evidence or authority.
