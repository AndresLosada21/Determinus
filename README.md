# AI-Driven Engineering v5.2.3 — Unified v5.2 Runtime

ADE v5.2.3 consolida na própria linha **v5.2** as duas evoluções que antes estavam separadas: **Structured Handoffs** e **Cost/Performance Intelligence**. A governança Product / Delivery / Engineering continua intacta, mas comunicação entre agents deixa de depender de texto livre como fonte canônica.

## O que muda sobre v5.2.0

### 1. Structured Handoff canônico
Todos os ADE agents, exceto o Orchestrator, recebem `ade_handoff_submit` e devem chamá-la exatamente uma vez antes de finalizar uma delegação.

Schema lógico:

```json
{
  "status": "DONE | PARTIAL | BLOCKED | FAILED",
  "changed": ["..."],
  "evidence_refs": ["..."],
  "blocker": "...",
  "required_owner": "none | orchestrator | product-owner | project-manager | engineer",
  "next": "..."
}
```

Enforcement no plugin:
- máximo 4096 bytes por handoff;
- até 8 `changed` e 8 `evidence_refs`;
- limites por string;
- `BLOCKED` exige `blocker`;
- `required_owner` é validado por source agent;
- source agent/session vêm do runtime, não do input do modelo;
- histórico durável em `.ai/handoffs.jsonl`;
- somente os 3 handoffs compactos mais recentes entram no `control.json`;
- publicar handoff **não incrementa revision do estado canônico**.

O texto final do child é UX. Routing/acceptance nunca são concedidos pelo texto livre.

### 2. State-driven routing + handoff advisory
`ade_route_snapshot` continua derivando o owner primário do estado canônico. O handoff tipado aparece como `handoff_advisory` e nunca sobrepõe autoridade de Product/Delivery/Engineering. Em divergência, `STATE_PRECEDENCE` vence.

### 3. Respostas curtas realmente verificáveis
Cada child deve, após `ade_handoff_submit`, responder em até 3 linhas. Behavioral canaries verificam tool usage, owner, rota e budget de texto — não frases mágicas.

### 4. Validation tiers sem esconder regressão

**Core Runtime** — bloqueante para operação:
- manifesto/plugin/provider/catalog;
- tool execution real;
- configuração V2.

**Contract Assurance** — determinística e sempre executada pelo `validate`:
- 18 agents / 26 tools;
- structured handoff schema e ownership;
- agent permission parity;
- persistence/limits;
- state-driven routing;
- telemetry privacy;
- generation budgets.

**Behavioral Canary** — model-driven:
- Orchestrator → Project Manager → Tracker Operator;
- capability-denial recovery via structured handoff;
- Engineer → Verifier;
- resposta compacta.

`validate --model` pode terminar com `BEHAVIORAL_CANARY_PENDING` para uso cotidiano. Já `assurance --model` executa behavioral por padrão e **não alega release assurance** sem ele.

### 5. Cost/Performance Intelligence
`.ai/telemetry.jsonl` contém metadados, nunca prompt/tool args:
- `tool.call`: agent/tool/status/duration;
- `model.dispatch`: provider/model, generation budget, message/tool counts e estimativa de contexto;
- `provider.retry`: provider/model/attempt/error type/retry decision.

Comandos:
- `/ade-metrics` — distribuição por agent/tool/model, retries, dispatches, budget e input estimado;
- `/ade-cost` — usage/cost exato quando exposto por `session.context`, com fallback explicitamente estimado;
- `/ade-handoffs` — últimos handoffs canônicos;
- `/ade-trace` — telemetria recente;
- `/ade-why` — state route + handoff advisory;
- `/ade-doctor` — diagnóstico explícito.

## Capability surface

18 agents, **26 typed ADE tools**. O Orchestrator continua mínimo: somente `ade_status` + `ade_route_snapshot`. `ade_handoff_submit` aparece apenas nos 17 agents que devolvem trabalho a um parent/control plane.

## Upgrade recomendado: v5.2.0 → v5.2.3

No release bundle:

```powershell
py -B .\migrate-opencode-v5.2.0-to-v5.2.3.py
opencode2 service restart
py -B .\validate-opencode-v5.2.3.py --model "opencode/muse-spark-1.2-contributor-free"
```

Esse primeiro validate deve incluir `CONTRACT_ASSURANCE_VALIDATED`.

Para provar comportamento real do provider/model:

```powershell
py -B .\validate-opencode-v5.2.3.py --model "opencode/muse-spark-1.2-contributor-free" --behavioral
```

Para release assurance completa:

```powershell
py -B .\assure-opencode-v5.2.3.py --source --model "opencode/muse-spark-1.2-contributor-free"
```

`assure --model` roda o behavioral canary por padrão. `--core-only` existe apenas para diagnóstico e imprime explicitamente que release assurance **não** foi alegada.

## Compatibilidade

- OpenCode V2 Promise plugin API;
- configuração canônica `experimental.subagent_depth: 2`;
- Python 3.9+ tooling;
- Windows pagefile diagnostic incluído para Bun `os error 1455`.

Veja `STRUCTURED_HANDOFFS.md`, `COST_INTELLIGENCE.md`, `VALIDATION.md`, `COMPATIBILITY.md` e `RELEASE_NOTES_v5.2.3.md`.


## v5.2.3: Delegation-Driven Children

O Orchestrator continua `STATE_DRIVEN`; owners e specialists críticos passam a `DELEGATION_DRIVEN`. Consulte `DELEGATION_DRIVEN.md`. O comando `behavioral-reliability` mede consistência do provider/model por múltiplos trials mantendo cada assert estrito.
