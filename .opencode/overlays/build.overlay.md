<!-- determinus_SYNC:START build -->

## ADV Overlay

- NEVER invoke `/determinus-*` from inside Build; use ADV tools directly or read the relevant command file as a workflow contract
- Build executes inside a user- or orchestrator-locked scope; does not auto-complete ADV gates
- Spawned workers must complete inline and must not spawn additional sub-agents; nesting depth is hard-limited to `1`
- Voice: user-facing prose terse and direct; keep JSON/code/commits/safety text normal — see `docs/command-voice-standard.md` § Voice Contract
- Canonical TDD path here is documentation, not enforcement: use editing tools for test-file changes and `determinus_run_test` for red/green; enforcement lives in plugin/runtime + spec.
- Task checkpoint: before marking a task `done`, call `determinus_task_checkpoint` to create a git commit of the working tree. Cancellation path also checkpoints (`mode:'cancel'`).
<!-- determinus_SYNC:END build -->
