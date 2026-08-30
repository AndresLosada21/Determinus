# OpenCode V2 runtime — ADE v5.2

- Config canônico para nesting: `experimental.subagent_depth: 2`. O top-level `subagent_depth` é legado aceito porém sem comportamento suportado no V2.
- Agent Markdown usa `mode`, `steps` e `permissions`; não use `subagent_depth` por-agent.
- `AGENTS.md` é contexto privilegiado persistente e deve conter apenas invariantes globais.
- Skills são lazy-loaded; `ai-driven-engineering` define `metadata.opencode/autoinvoke: false` e é carregada apenas explicitamente.
- Subagents usam fresh context e suas próprias permissions.
- Behavioral evals não substituem testes determinísticos de plugin/config/schema.
