# Durable Kernel — ADE 6.0.11

Canonical workflow state remains outside the repository in a hash-chained journal. LLM sessions remain disposable workers.

## Project admission reconciler

Engineering admission now includes one deterministic project self-heal pass before DAG creation. It may repair only ADE-owned configuration that is provably safe to normalize. Security-sensitive gaps produce a human gate before any worker token spend. Unknown state blocks.

This reconciler exists specifically so ADE can be introduced into repositories with historical `.ai` state without requiring a sequence of manual patch/retry cycles. It is not an LLM-driven mutation loop and cannot authorize itself.
