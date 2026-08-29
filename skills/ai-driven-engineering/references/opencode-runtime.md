# Compatibilidade e runtime OpenCode

## Baseline
A v4 usa config V2, `permissions` ordenadas, ação `shell`, ação `subagent`, agentes em `agents/`, skill em `skills/` e `subagent_depth: 2` no nível raiz.

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
