# Parallelism

## Cross-plane

Do not parallelize work that depends on an unapproved upstream contract.

Safe examples:
- Product Owner clarifies acceptance while Engineering Explorer performs read-only discovery needed to estimate feasibility,
  as long as no implementation commitment is inferred.
- Independent delivery-risk research may occur beside technical discovery.

## Engineering

Read-only discovery is the default parallelizable work.

Concurrent writers require:
- no predecessor dependency;
- disjoint write/behavior surface or isolated workspaces;
- no unsafe shared-state collision;
- no common unresolved decision;
- explicit integration ownership.

Parallelism exists to reduce latency, not to simulate organizational complexity.
