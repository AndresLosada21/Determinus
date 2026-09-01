# advance

> **Version:** 1.0.0
> **Updated:** 2026-02-12

## Purpose

Requirements for advance

## Requirements

### Project-Level Wisdom System

**ID:** `rq-W1sD0mR1` | **Priority:** **[MUST]**

Durable cross-change learnings must be persisted in a project-level JSONL store to improve agent performance across sessions.

#### Scenarios

**Durable learning promotion** (`rq-W1sD0mR1.1`)

**Given:**
- A convention-level learning discovered in a change

**When:** determinus_wisdom_promote is executed

**Then:**
- The entry is appended to project-level wisdom.jsonl

---

### Manifest-Driven Workflow recommendations

**ID:** `rq-M4n1f3s1` | **Priority:** **[MUST]**

Command recommendations in determinus-status must be derived from a type-safe workflow manifest to ensure consistent pathing.

#### Scenarios

**Context-aware recommendations** (`rq-M4n1f3s1.1`)

**Given:**
- A change at implementation gate

**When:** determinus-status is run

**Then:**
- It recommends determinus-review or determinus-harden based on manifest successors

---

### Adversarial Review Enforcement

**ID:** `rq-R3v13wR1` | **Priority:** **[MUST]**

/determinus-review and /determinus-harden must enforce a minimum findings threshold to prevent shallow 'LGTM' behavior.

#### Scenarios

**Minimum findings validation** (`rq-R3v13wR1.1`)

**Given:**
- A review with fewer than 3 non-nit findings

**When:** Gate completion is attempted

**Then:**
- The gate remains open and requires explicit justification for the clean result

---
