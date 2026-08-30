# Compatibilidade e runtime OpenCode

## Baseline
A v4 usa config V2, `permissions` ordenadas, ação `shell`, ação `subagent`, agentes em `agents/`, skill em `skills/` e `subagent_depth: 2` no nível raiz. `project-manager` e `engineer` também declaram `subagent_depth: 2` no frontmatter como defesa em profundidade em builds que suportam override por agente.

## Restrição operacional conhecida
Prompts `ask` originados em sub-subagents podem não aparecer ao usuário em algumas versões. Por isso especialistas de profundidade 2 usam allow/deny determinístico e escalam ações fora da allowlist como `PARENT_EXECUTION_REQUIRED`.

## Smoke test
Rode `runtime/runtime-smoke.ps1`. Ele verifica layout, config resolvida quando o CLI está disponível e, opcionalmente, um probe real que consome modelo.

## Fallback sem nesting saudável
1. Rode `engineer` como agente principal para trabalho técnico;
2. se nesting ainda falhar, execute especialistas explicitamente em sessões separadas usando os delegation contracts gerados pelo Engineer;
3. devolva resultados ao Engineer para Engineering Acceptance;
4. use `orchestrator` para gates globais.

O fallback preserva autoridade e evidência mesmo sem coordenação nested automática.


## v4.2.1 — shell ergonomics sem privilege widening
Permissions `shell` casam contra o comando raw completo. Por isso `git log*` não equivale a `git -C <repo> log*`. Use `git-readonly.ps1` para metadata cross-workspace.

Checks Docker/projeto não recebem `docker run*` amplo. O Verifier usa `run-project-check.ps1` e `.ai/execution-policy.json` autorizada pelo humano.
