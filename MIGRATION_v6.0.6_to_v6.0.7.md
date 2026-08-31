# Migration - ADE 6.0.6 to 6.0.7

```powershell
py -B .\migrate-v6.0.6-to-v6.0.7.py
opencode2 service restart
py -B .\validate-opencode.py
```

Then run one new read-only `analysis` workflow. The worker must reach an assistant message and complete; if the host execution itself fails, ADE 6.0.7 now reports `ADE_KERNEL_WORKER_EXECUTION_FAILED` with sanitized outcome/context/token evidence instead of collapsing it into `empty assistant result`.
