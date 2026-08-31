# Validation — ADE 6.0.11

Required release gates:

- Python regression suite.
- Node functional suite, including historical-project self-heal regressions.
- TypeScript typecheck.
- Static Policy.
- Clean extracted ZIP rerun.
- Fresh install.
- Managed migration ADE 6.0.10 → 6.0.11 without `--force`.
- Canonical `/api/agent` catalog validation for every active managed role.
- Real OpenCode beta-18721 canary before any `HOST_VALIDATED` claim.

Critical self-heal invariants:

- absent `.ai`/execution policy can be initialized only to `authorized:false`;
- explicit deny values are preserved;
- malformed historical state is not guessed or overwritten;
- process legacy omission is normalized, but exact-effect execution authorization is still mandatory;
- no engineering worker starts while a human security gate remains unresolved.
