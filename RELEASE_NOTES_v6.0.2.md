# ADE 6.0.2 - Durable Worker Dispatch Fix

ADE 6.0.2 fixes a host-observed v6 durable scheduler defect on OpenCode beta-18707.

Worker prompts are dispatched with `delivery: "steer"` so a newly created worker session executes immediately before the kernel waits for it. The kernel now accepts only an assistant-role message as worker output. A queued user capsule can no longer be recorded as a worker result or promote a job to `DONE`.

The active worker topology, exact-effect authorization, scoped ChatGPT/Codex `max_output_tokens` compatibility, and public OpenAI behavior are unchanged.

## Upgrade

Run `py -B .\migrate-v6.0.1-to-v6.0.2.py` from the extracted source, restart OpenCode, and validate with the configured provider.
