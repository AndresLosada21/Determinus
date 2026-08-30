# AI-Driven Engineering v5.2.0 — State-Driven OpenCode V2 Runtime

ADE v5.2.0 é uma release de estabilização e eficiência para OpenCode V2. Ela preserva os planos **Product / Delivery / Engineering**, evidências, acceptance gates, least privilege e subagents especializados, mas remove o custo e o ruído de uma orquestração ritualística.

## Principais mudanças

### 1. State-driven routing
O Orchestrator não percorre mais `PO -> PM -> Engineer -> PM -> PO` por padrão. Ele consulta um snapshot compacto e chama somente o owner cuja autoridade é necessária no estado atual. Decisões existentes são reutilizadas enquanto sua revision/input relevante não mudar.

### 2. UX concisa e handoffs compactos
O Orchestrator usa `USER_BRIEF` (normalmente 3–6 bullets / ~180 palavras). Specialists usam `COMPACT_HANDOFF` com `status`, `changed`, `evidence_refs`, `blocker`, `required_owner`, `next`. Audit completo continua disponível via `/ade-audit`, `/ade-trace` e `/ade-why`.

### 3. Skill realmente lazy
`ai-driven-engineering` usa `metadata.opencode/autoinvoke: "false"`. Agents não carregam a Skill automaticamente. `AGENTS.md` contém apenas invariantes globais; regras específicas ficam nos agents/references.

### 4. Estado/evidência endurecidos
- `control.json` schema 3 e compacto;
- legacy `evidence: {}` é normalizado com segurança;
- histórico completo vai para `.ai/evidence.jsonl`;
- `ade_evidence_query` usa janela padrão 5;
- `ade_state_get` é compacto por padrão e `full` é explícito;
- `ade_route_snapshot` fornece somente a decisão mínima de routing.

### 5. Observabilidade sem poluir a conversa
`.ai/telemetry.jsonl` registra somente sinais mínimos de tool-call (`agent`, `tool`, `status`, `duration_ms`, timestamp/session id), nunca argumentos/prompts/segredos. Comandos:
- `/ade-why` — motivo do routing atual;
- `/ade-trace` — últimas chamadas ADE;
- `/ade-metrics` — contagens/duração por agent/tool;
- `/ade-doctor` — diagnóstico direto, sem round-trip de LLM.

### 6. Provider resilience
O plugin classifica `provider.invalid-request` relacionado a `tool_choice` e faz retry **limitado**. Isto é mitigação, não mascaramento: se o host reenviar deterministicamente uma request incompatível, a falha permanece visível após o limite.

### 7. OpenCode V2 config
`experimental.subagent_depth: 2` é a configuração canônica. O installer remove o top-level legado `subagent_depth`; não há `subagent_depth` per-agent.

## Capability surface

18 agents, 25 tools ADE. O Orchestrator vê somente `ade_status` e `ade_route_snapshot`; `ade_doctor` e state/evidence completos não fazem parte do happy path. Raw `shell`/`execute` continuam ocultos para todos os ADE agents.

## Instalação / upgrade

No release bundle:

```powershell
py -B .\install-opencode-v5.2.0.py
opencode2 service restart
py -B .\validate-opencode-v5.2.0.py --model "opencode/muse-spark-1.2-contributor-free"
```

Upgrade gerenciado de v4/v5.0/v5.1:

```powershell
py -B .\migrate-opencode-to-v5.2.0.py
opencode2 service restart
py -B .\validate-opencode-v5.2.0.py --model "opencode/muse-spark-1.2-contributor-free"
```

O installer aplica rollback transacional aos arquivos gerenciados: cria backup, recusa sobrescrever customização não reconhecida sem `--force`, escreve manifesto schema 7 e preserva settings não-ADE.

## Validação

Core runtime (bloqueante):

```text
INSTALLED_MANIFEST_VALIDATED
PLUGIN_LOADED_VALIDATED
PROVIDER_BASELINE_VALIDATED
PLUGIN_CATALOG_VALIDATED
PLUGIN_TOOL_EXECUTION_VALIDATED: orchestrator -> ade_status
SUBAGENT_DEPTH_CONFIGURED: experimental.subagent_depth=2
RUNTIME_CONFIG_VALIDATED
ADE_V5_RUNTIME_CORE_VALIDATED
RUNTIME_VALIDATED: 5.2.0
BEHAVIORAL_EVALS_SKIPPED
```

Behavioral eval (opcional, estrito e probabilístico):

```powershell
py -B .\validate-opencode-v5.2.0.py --model "..." --behavioral
```

Ele prova nesting/routing/model compliance e **não é flexibilizado para transformar uma rota diferente em sucesso**.

## Source gates

```powershell
py -B .\tooling\ade.py regression --package-root .
cd plugin
npm test
npm run typecheck
```

A release contém 32 grupos de regressão Python e 24 testes Node, além do typecheck TypeScript.

Veja `VALIDATION.md`, `COMPATIBILITY.md`, `OPENCODE_V2_AUDIT.md` e `RELEASE_NOTES_v5.2.0.md`.
