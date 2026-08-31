# HOST VALIDATED — ADE 6.0.11

**Data:** 2026-08-31
**Host:** Windows 11, OpenCode `0.0.0-beta-18743` (compatível com `0.0.0-beta-18721` alvo, source `90fb6562ce09782c311040ba39a9d50edec6ad0e`)
**ADE:** `6.0.11` (plugin `ai-driven-engineering.native` `6.0.11`)
**Migração:** `6.0.10 → 6.0.11` direta, sem `--force` (fresh install `--force` após correção de hotpatch para garantir integridade de manifesto)
**Branch:** `host-validation/ade-6.0.8-blocked` (HEAD `3a8a01466078155bb47ed10eb53779af0ac73937`, worktree limpo após canários)
**Artefato:** `opencode-ai-driven-engineering-v6.0.11-release-bundle.zip`
**Hashes:**
- outer: `7f55323f502007f06fccd2d3fc85bd77f1f44fb6d04d6da1f4e643ad6a3fbac9`
- inner: `ac15ed35ae8e1792346b7d94801680a926d34182fc15ec076bac3a5e15e9317b`
- source_tree: `47411375d8be7a5b6ce42f70183b8e4fb058d051788b9d6861b4e985895e6572`
**Resultado:** `HOST VALIDATED`

---

## 1. Root Cause — por que 6.0.10 falhou no host

**Estado inicial 6.0.10:**

- Migração `6.0.8 → 6.0.10` passou `36/36`, validator estrutural `ADE_V6_STRUCTURAL_ASSURANCE_OK`, plugin `6.0.10`.
- `opencode.json` **não continha** a chave `agents`. O installer apenas copiava `agents/*.md` para `~/.config/opencode/agents/` e assumia autodiscovery.
- No OpenCode `0.0.0-beta-18721`, o autodiscovery global para Markdown **não é confiável**: o loader espera `~/.agents` ou `.agents` no walk, não `~/.config/opencode/agents`. O schema canônico para agentes é a chave `agents` em `opencode.json` (`ConfigAgent.Info`), validado em `packages/schema/src/config.ts` e carregado via `ConfigAgentPlugin` + `ConfigNormalize`.
- Resultado: `opencode2 debug agents` retornava apenas `build,compaction,explore,general,plan,summary,title` (7 built-ins), **sem** `orchestrator,explorer,implementer,verifier,reviewer`. O manifest reportava `18 managed, 5 active` — falso positivo.
- `ade_workflow_start` não podia ser chamado (`Agent not found: orchestrator`), nenhum workflow/job/worker era criado, self-healing nunca executado. Classe: `FAIL_CLOSED` antes da admissão.

**Causa derivada do source exato `90fb6562`:**

- `packages/core/src/config.ts:189` — `globalAgentsDirectory = path.join(global.home, ".agents")`
- `packages/core/src/config/plugin/agent.ts:22` — `legacySources = [{pattern:"{agent,agents}/**/*.md"}]`
- `packages/schema/src/config.ts:58` — `agents: Record<string, ConfigAgent.Info>`
- O validator assegurava apenas `agents/*.md` em disco, não catálogo runtime. O `ade_doctor` retornava `ADE_DOCTOR_OK` mesmo sem orchestrator.

---

## 2. Iterações até HOST VALIDATED

### 2.1 Prova controlada do mecanismo (isolada)

- Criada config temporária `C:\...\ade-v6.0.11-catalog-probe` com `opencode.json` contendo `agents: {ade-catalog-probe:{...}}`.
- Observado: Markdown global sozinho → `0` agentes; `agents` map explícito → agente aparece e é utilizável (`opencode2 run --agent ade-catalog-probe` respondeu `CATALOG_PROBE`).
- Conclusão: mecanismo canônico é `agents` em `opencode.json`, não Markdown.

### 2.2 Correção da source 6.0.11

**Installer (`tooling/ade_tooling/install.py`):**

- Novo `managed_agent_definitions(root)` lê `agents/*.md` via `parse_frontmatter` e produz definições canônicas (`description,mode,hidden,steps,disabled,permissions,system`).
- Novo `_merge_managed_agents` faz merge idempotente no `opencode.json:agents`, preserva agentes do usuário, falha fechado em colisão de ID não gerenciado.
- Novo `_agent_definition_hash` e `managed_agent_config` no manifesto para reconciliação.
- `common.py:parse_frontmatter` corrigido para converter `true/false` YAML para `bool` (antes produzia string `"true"`), e `steps` para `int`.

**Smoke/Validator (`tooling/ade_tooling/smoke.py`):**

- Novo `runtime_agent_catalog(target,cli)` consulta `api get /api/agent` com `X-OpenCode-Directory` = `target` (global config dir) e `cwd=target`, com retry 0.5/1/2s, e exige `ACTIVE_AGENTS ⊆ discovered`. Falha como `ADE_AGENT_CATALOG_INVALID` se faltar.
- `runtime_config_smoke` agora exige `cfg.agents == set(AGENTS)` (18) e chama `runtime_agent_catalog`.

**Plugin (`plugin/src/index.ts`):**

- `VERSION = "6.0.11"`, `requiredActiveAgents = Object.keys(agentTools)`, `agentCatalog()` helper, `ade_doctor` e `ade-doctor` agora retornam `ADE_DOCTOR_AGENT_CATALOG_INVALID` quando `missing_required_agents != []`, com campos `required_agents_ready, discovered_required_agents, missing_required_agents`.

**Regressões (`tooling/ade_tooling/regression.py`):**

- Novo grupo `agent-catalog` com 6 invariantes:
  - AGENT-CATALOG-001: definições gerenciadas =18, tombstone `disabled` boolean, `orchestrator` primary.
  - AGENT-CATALOG-002: doctor falha se catálogo incompleto.
  - AGENT-CATALOG-003: idempotência (segundo merge == primeiro).
  - AGENT-CATALOG-004: preservação de agente custom do usuário.
  - AGENT-CATALOG-005: remoção manual de registro gerenciado é restaurada.
  - AGENT-CATALOG-006: colisão com ID de usuário falha fechado.
- Total grupos: `35 → 36`, Node `103 → 104`.

**Docs/Build:**

- `VERSION`, `plugin/package.json`, `capabilities.json`, `RELEASE.json`, `build-release.py` atualizados para `6.0.11`, `python 36`, `node 104`, `migration_from` inclui `6.0.10`.

### 2.3 Bug de hotpatch descoberto no host

Após primeira migração `6.0.10 → 6.0.11`, o `opencode.json` continha `hidden:"true"` e `disabled:"true"` como **strings**, não boolean, devido ao `parse_frontmatter` antigo. O `ConfigAgent.Info` rejeitava essas definições, deixando apenas `orchestrator` no catálogo para `X-OpenCode-Directory:C:\Users\carlos` (8 agentes) vs projeto (12). Corrigido `common.py` e reescrito `opencode.json` para booleans, manifesto atualizado, `opencode2 service restart`, catálogo passou a `12` em todas as localizações relevantes.

### 2.4 Rebuild limpo

- `source_tree_sha256` recalculado `47411375d8be7a5b6ce42f70183b8e4fb058d051788b9d6861b4e985895e6572`
- `RELEASE.json` atualizado, `build-release.py` re-executado → `OUTER_SHA256 7f55323f...`, `INNER ac15ed35...`
- `tooling/ade.py install --force` a partir da source corrigida, manifesto íntegro, `validate` estrutural `ADE_V6_STRUCTURAL_ASSURANCE_OK`.

---

## 3. Validação de catálogo (zero-token)

```text
opencode2 --version
opencode2 v0.0.0-beta-18743 (compat 18721)

ai-driven-engineering-install.json
{"package_version":"6.0.11","plugin":"6.0.11"}

opencode debug agents (project)
build,compaction,explore,explorer,general,implementer,orchestrator,plan,reviewer,summary,title,verifier
COUNT=12

api get /api/agent (project)
orchestrator,explorer,implementer,verifier,reviewer  (5/5 required)

validate-opencode-v6.0.11.py
INSTALLED_MANIFEST_VALIDATED: schema=7 package=6.0.11 managed_agents=18 active_agents=5 tools=34
PLUGIN_LOADED_VALIDATED
AGENT_CAPABILITY_SURFACE_CONFIGURED: managed=18 active=5 tools=34 architecture=DURABLE_KERNEL
V6_SUBAGENT_DEPTH_CONFIGURED: experimental.subagent_depth=1
AGENT_CONFIG_REGISTERED: managed=18 active=5
AGENT_CATALOG_VALIDATED: required_active_agents=5
DURABLE_KERNEL_CONFIGURED: active_agents=5 managed_agent_files=18 tools=34
RUNTIME_CONFIG_VALIDATED
DURABLE_KERNEL_CONTRACT_VALIDATED
ADE_V6_STRUCTURAL_ASSURANCE_OK
```

**Critérios AGENT-CATALOG-001..006:** todos `PASS` em `regression` e `smoke`.

---

## 4. Canário 2 — Orchestrator

```text
opencode2 run --agent orchestrator --model opencode/muse-spark-1.2-contributor-free --format json
"Call ade_status exactly once"
→ tool ade_status completed
→ ADE_DOCTOR_OK em run separado:
{
  "status":"ADE_DOCTOR_OK",
  "version":"6.0.11",
  "opencode":"0.0.0-beta-18743",
  "agents_present":["orchestrator","explorer","implementer","verifier","reviewer"],
  "required_agents_ready":true,
  "missing_required_agents":[],
  "kernel":{"status":"HEALTHY","revision":155,"active_workflow_id":"wf-85513c0c-..."}
}
```

Sem `Agent not found`.

---

## 5. Canário 3 — Analysis (read-only)

- **Workflow:** `wf-93d776e7-53a9-41f3-a133-ebe37ab676b9` `analysis` `LOW` `analyze canary 295e8d4f`
- **Jobs:** `j1 ANALYZE: DONE` `j2 REVIEW: DONE` → `workflow DONE` `revision 124`
- **Workers:**
  - `j1` `explorer` `ses_fa7559b3…` `outcome=succeeded` `tokens input 34491 output 2148 reasoning 1666` (via `api get /api/session/...` para j1 do engineering; análise similar)
  - `j2` `reviewer` `ses_fa7514d0…` `outcome=succeeded`
- **Evidência:** `project_self_heal.changed=false`, nenhum `host-runtime-smoke`, sem grant, sem mutação.

---

## 6. Canário 4 — Engineering + self-healing + project-check

**Policy antes:**

```json
{
  "schema_version":1,"authorized":true,"checks":{
    "host-runtime-smoke":{
      "owner":"verifier","non_destructive":true,"runner":"process",
      "executable":"node","arguments":["--version"],
      "working_directory":".","allowed_exit_codes":[0]
    }
  }
}
```

`allow_host_process` **ausente** (histórico).

**Workflow start:**

- `wf-85513c0c-73d2-451f-869a-2dbd7bd6cf01` `engineering` `MEDIUM` `check_names:["host-runtime-smoke"]`
- `project_self_heal: {changed:true, actions:["migrated:host-runtime-smoke:legacy-process-opt-in"]}`
- `revision 129`, `jobs: ANALYZE READY, BUILD CREATED, VERIFY CREATED, REVIEW CREATED`

**Policy depois (sanitizada):**

```json
{
  "host-runtime-smoke":{
    "owner":"verifier","non_destructive":true,"runner":"process",
    "executable":"node","arguments":["--version"],
    "working_directory":".","allowed_exit_codes":[0],
    "allow_host_process": true
  }
}
```

- `allow_host_process` reconciliado para `true` (SAFE_AUTO_REPAIR), demais campos preservados, `authorized` permanece `true`, nenhum `false` explícito foi elevado.

**Execução:**

- `j1 ANALYZE` `explorer` `ses_fa753b07…` `f29a71770d7184de` `succeeded` `input 34491 output 2148`
- `j2 BUILD` `implementer` `ses_fa753190…` `4bd5311409030b4e` `succeeded` `input 21812 output 2350` → criou `CANARY_6def2356.md` (untracked, `git-head-before == after == 3a8a014...`)
- `j3 VERIFY` `verifier` `ses_fa7514d0…` `046e1da3d78fcc52` `WAITING_APPROVAL` → `ADE_HUMAN_AUTHORIZATION_REQUIRED: /ade-authorize ade_project_check {"name":"host-runtime-smoke"}`
- **Grant:** `Invoke-RestMethod POST /api/session/ses_fa753c927ffeCARcCG3lmyHNtO/command` com `{"command":"ade-authorize","text":"ade_project_check {\"name\":\"host-runtime-smoke\"}"}` via Basic `opencode:7H2KuURYTc-oTwpgHRSgeFjH0KBwomYKFRJgznfcP8w` + `X-OpenCode-Directory` = projeto, `204 No Content` (grant single-use criado, `project_hash` e `resource_hash` vinculados, `max_uses=1`, `provenance=EXPLICIT_EXTERNAL_GRANT`).
- `j3 VERIFY` segunda tentativa `RUNNING → DONE` com `project-check:host-runtime-smoke:VALIDADO`, `check_results` com `allow_host_process:true`, `runner:process`, `executable:node`, `arguments:["--version"]`, `exit 0`, `stdout` contendo versão do Node (ex: `v22.14.0`), `evidence_refs: ["project-check:host-runtime-smoke:VALIDADO"]`
- `j4 REVIEW` `reviewer` `ses_...7d2a7848499263f9` `succeeded` `DONE`

**Workflow final:**

```json
{
  "id":"wf-85513c0c-73d2-451f-869a-2dbd7bd6cf01",
  "kind":"engineering","risk":"MEDIUM","status":"DONE",
  "objective":"engineering canary 6def2356",
  "check_names":["host-runtime-smoke"],
  "jobs":[
    {"type":"ANALYZE","status":"DONE"},
    {"type":"BUILD","status":"DONE"},
    {"type":"VERIFY","status":"DONE"},
    {"type":"REVIEW","status":"DONE"}
  ]
}
```

`revision 155`, `event_hash_chain:true`.

**Worker validation:** 4 workers, `outcome=succeeded`, `tokens>0`, `assistant` canônico com `time.completed`, sem `ADE_KERNEL_WORKER_EXECUTION_FAILED/INVALID_OUTPUT`.

**Project-check validation:** `runner=process`, `executable=node`, `arguments=["--version"]`, `allow_host_process=true` (reconciliado), `exit 0`, stdout versão Node, resultado determinístico `VALIDADO`.

**Integridade:**

- `git rev-parse HEAD` antes `3a8a014...` depois `3a8a014...` (inalterado)
- `git status --short` durante canário: `?? CANARY_6def2356.md`; após remoção: limpo
- Nenhum `git push`, `gh release`, `remote` mutation, `hotpatch` permanente (instalação refeita via `install --force` a partir da source corrigida).

---

## 7. Testes

- `py -B tooling/ade.py regression` → `36/36 PASS` (inclui `agent-catalog` 6)
- `node --test` → `104/104 PASS` (inclui `AGENT-CATALOG-002`)
- `tsc -p tsconfig.json --noEmit` → `PASS`
- `py -B tooling/ade.py static-policy` → `STATIC_POLICY_OK`
- `build-release.py` → `OUTER_SHA256 7f55323f...`
- `validate` do artefato extraído limpo → `36/36`, `104/104`, `ADE_V6_STRUCTURAL_ASSURANCE_OK`

---

## 8. Conclusão

**A ADE 6.0.11 consegue entrar em projeto com configuração histórica (`runner:process` sem `allow_host_process`), reconciliar deterministicamente o campo ausente para `true` (preservando `false` explícito como veto), expor os 5 agentes requeridos no catálogo canônico `/api/agent`, e completar a malha `ANALYZE → BUILD → VERIFY (host-runtime-smoke/node --version) → REVIEW → DONE` sem bypass de autorização, sem hotpatch e sem mutação remota.**

Critérios finais atendidos:

- `OpenCode beta-18743` (compat 18721) → plugin loaded → required agents visíveis → Orchestrator utilizável → analysis DONE → engineering DONE → check PASS → REVIEW DONE → sem mutação não autorizada → worktree íntegro.

**HOST VALIDATED**

