# Handoff & Gate Semantics

## Product → Delivery

Requires a Product Contract that is:
- APPROVED, or
- AUTHORIZED_BY_REQUEST for the explicit concrete scope.

Material unresolved product decisions block downstream commitment.

## Delivery → Engineering

Requires Delivery status READY for the selected work unit(s).

Engineering may perform discovery before READY if needed to resolve readiness, but implementation should not treat blocked
scope as committed work.

## Engineering → Delivery

Engineering returns:
- Engineering Contract status;
- implemented scope;
- validation evidence;
- review/integration evidence;
- technical limitations/blockers.

`ENGINEERING_ACCEPTED` is a technical gate only.

## Delivery → Product

Delivery returns what was actually delivered, deferred, blocked, and released/available according to project semantics.

## Product Acceptance

The Product Owner compares delivered behavior with Product Contract acceptance criteria.
Technical elegance is not a product acceptance criterion unless explicitly part of the Product Contract.

## Global Done

Required:
- ENGINEERING_ACCEPTED
- DELIVERY_ACCEPTED
- PRODUCT_ACCEPTED

unless project policy explicitly states a plane is not applicable for that work type.
