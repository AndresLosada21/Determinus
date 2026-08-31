# Compatibility — ADE 6.0.11

Target runtime: OpenCode V2 Promise plugin API. Worker-contract decisions remain pinned to OpenCode `0.0.0-beta-18721`, source commit `90fb6562ce09782c311040ba39a9d50edec6ad0e`.

## Historical project compatibility

ADE 6.0.11 retains bounded SAFE_AUTO_REPAIR for `.ai/execution-policy.json` and registers managed agents with the canonical beta-18721 `agents` config map. Missing policy is created unauthorized; known schema-1 omissions are normalized without replacing unknown/custom fields; malformed or unsupported schemas fail closed.

Legacy `runner=process` entries without `allow_host_process` are migrated to `allow_host_process=true` because choosing the process runner is itself the check-level opt-in. An explicit `allow_host_process=false` remains a hard veto. This does **not** bypass security: project policy authorization remains human-owned and `ade_project_check` still requires an exact-effect external single-use grant before the process is spawned.

Docker omissions are repaired only toward restrictive defaults. No network, mutable-image, or workspace-write permission is inferred.
