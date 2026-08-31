# Compatibility — ADE 6.1.0

Target runtime: OpenCode V2 Promise plugin API, `0.0.0-beta-18743`, source commit `5894e4668872ecb071bd10ac01b32dfb7e93fb0c`.

## Historical project compatibility

ADE 6.1.0 retains bounded SAFE_AUTO_REPAIR for `.ai/execution-policy.json` and registers managed agents with the canonical `agents` config map. Missing policy is created unauthorized; known schema-1 omissions are normalized without replacing unknown/custom fields; malformed or unsupported schemas fail closed.

BUILD classifies native VCS observations as `REPOSITORY`, `NO_REPOSITORY`, `VCS_UNAVAILABLE`, or `VCS_INCONSISTENT`. `REPOSITORY` enables the clean-worktree guard. `NO_REPOSITORY` and `VCS_UNAVAILABLE` use filesystem mode, so source edits and deterministic checks do not depend on Git. `VCS_INCONSISTENT` stops before creating a builder worker. Stage, commit, push, and pull-request operations remain Git-only exact effects.

Legacy `runner=process` entries without `allow_host_process` are migrated to `allow_host_process=true` because choosing the process runner is itself the check-level opt-in. An explicit `allow_host_process=false` remains a hard veto. This does **not** bypass security: project policy authorization remains human-owned and `ade_project_check` still requires an exact-effect external single-use grant before the process is spawned.

Docker omissions are repaired only toward restrictive defaults. No network, mutable-image, or workspace-write permission is inferred.
