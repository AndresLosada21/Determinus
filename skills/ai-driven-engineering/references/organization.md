# Organization & Authority

## Planes

### Product
Owns WHY and WHAT.

### Delivery
Owns WHEN, ORDER, DEPENDENCIES, STATUS, and DELIVERY GATES.

### Engineering
Owns HOW and TECHNICAL EVIDENCE.

### Orchestration
Owns handoff coordination and cross-plane consistency, but no domain authority overrides.

## Boundary examples

Product Owner may say:
- import HubSpot contacts is in scope;
- bidirectional sync is out of scope;
- duplicates must be reported.

Product Owner may not say:
- use Kafka;
- store mapping in Redis;
- use repository pattern.

Project Manager may say:
- migration cannot start until export format is known;
- workstream B is BLOCKED on A;
- Wave 1 contains two independent items.

Project Manager may not say:
- change from Postgres to MongoDB;
- remove acceptance criterion X;
- change business priority without authority.

Engineering Lead may say:
- current contract requires a migration adapter;
- two modules share a write surface and must be serialized;
- integration validation is unavailable.

Engineering Lead may not say:
- the feature is no longer important;
- drop a required product behavior to simplify implementation.
