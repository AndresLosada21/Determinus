# Changelog

## 5.2.2 — Unified structured communication + cost intelligence
- canonical `ade_handoff_submit` with bounded schema and authority validation;
- durable `.ai/handoffs.jsonl` + compact recent handoffs;
- handoff communication does not mutate canonical state revision;
- state-vs-handoff routing advisory with state precedence;
- deterministic Contract Assurance on every validate;
- behavioral canaries validate structured tool behavior instead of magic output markers;
- release assurance runs behavioral canary by default with a model;
- model dispatch / provider retry telemetry;
- `/ade-cost` and `/ade-handoffs`;
- v5.2.0 → v5.2.2 managed migration.

## 5.2.0 — State-driven stabilization & efficiency
- state-driven routing;
- lazy Skill loading;
- compact user UX;
- evidence hardening;
- bounded provider retry;
- initial ADE telemetry.
