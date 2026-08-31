# ADE 6.0.3 - Explicit Plugin Registration

ADE 6.0.3 restores native tool loading on OpenCode V2 beta-18721 and later builds that no longer discover the managed package directory implicitly.

The managed installer now merges `./plugins/ai-driven-engineering` into the OpenCode `plugins` array. It preserves existing entries and refuses a non-array value rather than replacing user configuration. This loads the native Durable Kernel tools; the agent markdown files alone are not treated as evidence that the plugin is loaded.

The durable worker dispatch fix from 6.0.2 and the scoped ChatGPT/Codex `max_output_tokens` compatibility from 6.0.1 are unchanged.
