# Observability and Audit

Canonical execution journal: `.ai/audit.jsonl`.

Each line is one JSON event with:
- `event_id`
- UTC timestamp
- work item ID
- event type
- actor
- plane
- action
- evidence status
- evidence refs
- redacted metadata

Use the audit journal for:
- tracker synchronization;
- state transitions;
- regression runs;
- integration/push verification;
- material routing or tool failures when a durable record is useful.

Do not store:
- tokens;
- secret values;
- private keys;
- raw `.env` content.

The audit log is evidence of an action occurring, not evidence that the action was correct. Correctness still requires the applicable verifier/gate.
