# Work Management Abstraction

## Principle

GitHub Projects, Jira and Linear are execution surfaces for Delivery. They do not own the internal acceptance gates.

Canonical internal state remains:
- `.ai/control.json` for Product/Delivery/Engineering/Global gates;
- `.ai/delivery-contract.md` for delivery intent and sequencing;
- `.ai/traceability.json` for cross-system links;
- `.ai/audit.jsonl` for execution history.

## Ownership

`project-manager` owns:
- decomposition into delivery work items;
- dependencies, order, readiness, delivery risk;
- mapping of internal work to an external tracker;
- Delivery Acceptance.

`tracker-operator` owns only external execution:
- discover provider capability/auth;
- list/get/create/update/comment/transition;
- link PRs and external references;
- synchronize traceability/audit.

## Providers

### GitHub

Preferred mechanism: official `gh` CLI.

Required config:
- `owner`
- `repository`

Optional Projects integration:
- `project_owner`
- `project_number`
- `status_field`
- `done_status`

Auth is managed by `gh auth`; never store a token in `.ai/`.

### Jira Cloud

Mechanism: REST API v3.

Required config:
- `base_url`
- `project_key`
- `issue_type`

Auth env names default to:
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`

Do not persist the values.

### Linear

Mechanism: public GraphQL API.

Required config:
- `team_id`

Optional:
- `project_id`

Auth env defaults to `LINEAR_API_KEY`. `auth_scheme` can be `api-key` or `bearer`.

## Normalized work item

Provider-specific objects map to:
- `internal_id`
- `title`
- `type`
- `priority`
- `dependencies`
- `provider`
- `external_id`
- `external_key`
- `url`
- `external_status`
- `assignee`
- links to branch/PR/commits
- sync metadata

Use `.ai/work-items/*.json` when durable per-item state is useful.

## Final-state invariant

By default:

`external done/closed` requires `.ai/control.json.global_status == DONE`.

This prevents an external workflow status from bypassing Engineering, Delivery, or Product Acceptance.

A project may define provider-specific intermediate statuses. Any override that permits an external terminal state before Global DONE must be an explicit human/product delivery policy decision and recorded in `.ai/decision-log.md`.
