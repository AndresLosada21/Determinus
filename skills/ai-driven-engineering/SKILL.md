---
name: ai-driven-engineering
description: Constituição e referência operacional do ADE para decisões de routing, acceptance, evidence e troubleshooting do próprio runtime.
compatibility: OpenCode V2; experimental.subagent_depth >= 2 quando nesting owner->leaf é necessário.
metadata:
  opencode/autoinvoke: "false"
---
# AI-Driven Engineering v5.2.0

Esta skill é **explícita e sob demanda**. Agents ADE já possuem seus contratos essenciais no próprio system prompt; não carregue esta skill em todo trabalho. Carregue-a quando o usuário pedir a metodologia, quando houver dúvida de governança/routing, ao depurar o ADE ou ao consultar uma referência detalhada abaixo.

## Constituição

- Product: WHY/WHAT e Product Acceptance.
- Delivery: ordem, dependências, readiness, tracker e Delivery Acceptance.
- Engineering: HOW, implementação, verificação e Engineering Acceptance.
- Orchestrator: routing entre planos e síntese; não absorve autoridade dos owners.
- `implemented != validated != engineering accepted != delivery accepted != product accepted`.
- Evidência: `OBSERVADO`, `INFERIDO`, `PROPOSTO`, `VALIDADO`, `DESCONHECIDO`.
- Segredos nunca são evidência.

## Routing v5.2

`ROUTING_POLICY: STATE_DRIVEN`

1. Leia primeiro `ade_status` ou `ade_route_snapshot` quando precisar decidir o owner.
2. Invoque **somente** o owner necessário para a próxima autoridade/transition.
3. Não invoque PO/PM/Engineer apenas para reconfirmar estado sem mudança de revision/entrada relevante.
4. Owner pode delegar leaf specialist quando a execução exigir especialidade ou independência.
5. Um erro idêntico e determinístico não deve ser repetido indefinidamente; registre a assinatura e aplique no máximo a recuperação específica prevista.
6. `PARENT_EXECUTION_REQUIRED` descreve blocker, owner necessário e evidência faltante; não significa hand-back automático ao usuário.

## Comunicação

### COMPACT_HANDOFF (agent -> parent)
Use somente os campos necessários:
- `status`
- `changed`
- `evidence_refs`
- `blocker`
- `required_owner`
- `next`

Não replique contratos inteiros, file:line massivo, session IDs ou toda a cadeia de decisões salvo quando forem necessários para resolver o blocker.

### USER_BRIEF (orchestrator -> usuário)
Por padrão, diga apenas:
1. o que mudou;
2. estado atual;
3. blocker real, se houver;
4. próxima ação que o sistema executará ou decisão humana realmente necessária.

Use `/ade-audit` ou `/ade-trace` para detalhes, não transforme cada resposta em relatório de auditoria.

## Evidence e estado

- `.ai/control.json` guarda estado corrente e uma janela pequena de evidências recentes.
- `.ai/evidence.jsonl` guarda o histórico completo de evidências.
- `.ai/audit.jsonl` guarda eventos/decisões.
- `ade_state_get` é compacto por padrão; `detail=full` é excepcional.
- `ade_evidence_query` deve buscar apenas o necessário; default curto.

## Validação e acceptance

- Implementer pode produzir `IMPLEMENTED_NOT_VALIDATED`; não concede `VALIDADO`.
- Verifier executa `ade_project_check` e registra validação técnica independente.
- Reviewer/Security Reviewer entram quando o perfil de risco/contrato exigir; não por ritual em toda mudança.
- Acceptance final exige evidência `VALIDADO` vigente para a revision/status do plano.

## OpenCode V2

- Use `experimental.subagent_depth`, não o top-level legado `subagent_depth`.
- `AGENTS.md` contém somente guidance persistente e global; não replique esta skill nele.
- Permissions usam `permissions`, ações `shell`, `subagent`, `skill`, etc., com last-match-wins.
- Skills são lazy-loaded; esta skill usa `opencode/autoinvoke: false` para evitar custo automático.

## Referências

Leia somente quando necessário:
- `references/opencode-runtime.md` — runtime/config V2.
- `references/opencode-routing.md` — hierarchy e delegation.
- `references/operating-model.md` — Product/Delivery/Engineering.
- `references/evidence-model.md` — evidence/acceptance.
- `references/security.md` — boundaries e secrets.
- `references/tdd-ultra.md` — TDD Ultra quando explicitamente aplicável.
- `references/release-and-git.md` — release/VCS.

## Troubleshooting do ADE

1. `/ade-status` para estado curto.
2. `/ade-doctor` somente quando houver indício de problema de runtime/plugin.
3. `/ade-trace` para routing/tool calls recentes.
4. `/ade-metrics` para custo operacional (tool calls, blockers, duração).
5. Behavioral evals são separados da certificação determinística do runtime; não torne um smoke permissivo só para ficar verde.
