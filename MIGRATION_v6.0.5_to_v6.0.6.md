# Migration - ADE 6.0.5 to 6.0.6

```powershell
py -B .\migrate-v6.0.5-to-v6.0.6.py
opencode2 service restart
py -B .\validate-opencode.py
```

Then run one read-only `analysis` workflow and confirm the worker reaches `DONE` without `ADE_KERNEL_WORKER_INVALID_OUTPUT: empty assistant result`.
