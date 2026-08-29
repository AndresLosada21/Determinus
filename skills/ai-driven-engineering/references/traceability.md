# End-to-End Traceability

Traceability links intent to delivery and technical evidence without making the tracker the internal source of truth.

Recommended chain:

`Product Contract -> Delivery Work Item -> External Issue -> Engineering Contract -> Branch -> Commit -> PR -> Validation Evidence -> Acceptance`

Canonical file: `.ai/traceability.json`.

Use `runtime/traceability.ps1` to add:
- external provider references;
- branches;
- commits;
- pull requests;
- evidence references.

Rules:
1. Links are additive and deduplicated.
2. Every mutation increments `revision` and updates `updated_at`.
3. Traceability does not create acceptance by itself.
4. Secrets must never be stored in URLs, metadata or evidence.
5. A PR/commit can be linked before acceptance; `DONE` still depends on `.ai/control.json`.
