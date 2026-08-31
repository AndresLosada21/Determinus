# Migration — ADE 6.0.0 → 6.0.1

ADE 6.0.1 is a compatibility and workflow-UX patch for the Durable Engineering Runtime.

## Upgrade

From the extracted release bundle:

```powershell
py -B .\migrate-opencode-v6.0.0-to-v6.0.1.py
opencode2 service restart
```

Open a new session and run:

```powershell
py -B .\validate-opencode-v6.0.1.py --model "opencode/muse-spark-1.2-contributor-free"
```

## Changes that matter operationally

- Requests to the ChatGPT/Codex OpenAI backend no longer carry the incompatible wire-level `max_output_tokens` field produced by ADE generation budgets.
- Public OpenAI API requests keep their output budget intact.
- `ade_workflow_start` now returns `WORKFLOW_STARTED`, `workflow_id`, and `next_action`; it only persists the durable DAG.
- `/ade-workflow` exposes the active workflow and the next runnable/waiting job.

The migration is managed and rollback-aware. Do not use `--force` for a normal managed 6.0.0 installation.
