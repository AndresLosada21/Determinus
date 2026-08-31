# Compatibility — ADE 6.0.1

ADE 6 targets the OpenCode V2 Promise plugin API and programmatic session lifecycle used by the durable scheduler (`session.create`, `switchAgent`, `prompt`, `wait`, `context`).

Raw native subagent recursion is not part of the v6 architecture. Installed config uses `experimental.subagent_depth=1` only as a shallow host compatibility setting.

The provider compatibility shim from v5.2.7 remains narrowly scoped to known OpenCode Zen free models that only accept `tool_choice=auto`; unknown providers/models are not rewritten.

The major migrator accepts managed ADE v4/v5 manifests, with v5.2.8 as the tested/recommended direct source release. Real OpenCode builds are validated separately because the V2 API is still evolving.

## ChatGPT/Codex OpenAI compatibility (6.0.1)
OpenCode sessions authenticated through ChatGPT/Codex may use `https://chatgpt.com/backend-api/codex/responses` while still reporting `providerID=openai`. On the observed beta-18707 host this route rejects `max_output_tokens` with HTTP 400. ADE keeps its semantic generation budget but removes the incompatible wire field only for that exact host/path in the `http.request` hook. Public `api.openai.com/v1/responses` is not rewritten.
