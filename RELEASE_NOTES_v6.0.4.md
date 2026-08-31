# ADE 6.0.4 - OpenCode Directory Entrypoint

OpenCode V2 beta-18721 reports `configured plugin directory has no index entrypoint` for the managed ADE directory. ADE 6.0.4 adds the required root `plugin/index.ts`, which reexports the existing native plugin implementation without changing its behavior.

This patch retains explicit plugin registration from 6.0.3, durable worker dispatch from 6.0.2, and scoped ChatGPT/Codex provider compatibility from 6.0.1.
