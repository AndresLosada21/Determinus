# Host Validation - ADE 6.0.8

## Conclusao

**HOST VALIDATION BLOCKED**

A ADE 6.0.8 nao esta aprovada para validacao completa de host neste ambiente. A instalacao e o novo preflight fail-fast foram validados, mas o fluxo de engenharia nao conseguiu executar o check deterministico oficialmente configurado.

## Ambiente e instalacao

- Bundle: `opencode-ai-driven-engineering-v6.0.8-release-bundle.zip`.
- SHA-256 validado: `8a8a6380a3bfb303e7bad7127c8c3a752d0a12e1bd59a486bae8d02bb42385a0`.
- Migracao oficial `6.0.7 -> 6.0.8`, sem `--force`: `35/35 PASS`.
- OpenCode: `0.0.0-beta-18721`.
- Plugin: `ai-driven-engineering.native` `6.0.8`.
- Kernel: `HEALTHY`.
- Superficie configurada: 18 managed agents, 5 active workers e 34 tools.
- `validate-opencode-v6.0.8.py`: `ADE_V6_STRUCTURAL_ASSURANCE_OK`.

## Preflight negativo

Antes de criar a policy de projeto, foi feita uma unica chamada de `ade_workflow_start` para um workflow `engineering` com o check `host-runtime-smoke`.

O kernel retornou:

```text
ADE_WORKFLOW_PROJECT_POLICY_REQUIRED: .ai/execution-policy.json ausente; no workers were started
```

Este teste passou. Nenhum workflow duravel, job, sessao de worker, etapa ANALYZE/BUILD/VERIFY ou token de worker foi criado. Isso valida a correcao de fail-fast da 6.0.8 para policy ausente.

## Policy e autorizacoes

Os scripts administrativos distribuidos pelo ADE foram usados para inicializar os templates `.ai/` ausentes e registrar o check `host-runtime-smoke`:

```json
{
  "authorized": true,
  "checks": {
    "host-runtime-smoke": {
      "owner": "verifier",
      "non_destructive": true,
      "runner": "process",
      "executable": "node",
      "arguments": ["--version"]
    }
  }
}
```

A autorizacao da policy e o grant exact-effect single-use para `ade_project_check {"name":"host-runtime-smoke"}` foram aprovados explicitamente por humano e emitidos pelo command handler oficial. Nenhuma autorizacao foi contornada.

## Workflow de engenharia

Workflow: `wf-eaccae29-fd41-4da1-a825-93f9af7d9662`.

| Job | Status | Sessao | Outcome | Tokens (input/output/reasoning) |
| --- | --- | --- | --- | --- |
| ANALYZE | DONE | `ses_fa7c3d3c4ffekglricf9AWC2dk` | succeeded | 34957/719/403 |
| BUILD | DONE | `ses_fa7c34afeffeaFpLu993p918yt` | succeeded | 25144/182/91 |
| VERIFY | BLOCKED | `ses_fa7c32456ffet69eR4Sa87F3x8` | succeeded | 16593/376/108 |
| REVIEW | CREATED | - | nao executado | - |

As tres sessoes de worker tiveram mensagens `assistant`, consumo de tokens positivo e nenhum erro de provider. O bloqueio nao e uma regressao do problema anterior de workers vazios.

## Causa do bloqueio

O check nao executou `node --version`. O journal registrou o seguinte resultado antes do inicio do processo:

```text
PROJECT_CHECK_BLOCKED: process runner exige allow_host_process=true; prefira docker sandbox
```

O job VERIFY recebeu `failure_domain: POLICY` e o workflow recebeu:

```text
ADE_WORKFLOW_CHECK_FAILED: host-runtime-smoke: PROJECT_CHECK_BLOCKED: process runner exige allow_host_process=true; prefira docker sandbox
```

Ha uma incompatibilidade entre os mecanismos distribuidos na release:

- `runtime/register-project-check.ps1` registra um check `process` sem `allow_host_process`.
- O runtime instalado exige `allow_host_process=true` para todo check com `runner: "process"` antes de executar o comando.

Portanto, o exemplo administrativo oficial `node --version` nao chega a ser executado como check do kernel. Nenhum hotpatch do plugin, alteracao manual de policy para contornar a barreira ou execucao manual do check foi feita.

## Integridade do repositorio

- HEAD preservado: `0d24c7a9a9f50896a885573f5d75f4865a361fad`.
- O worktree Git permaneceu limpo; os templates administrativos `.ai/` sao ignorados pelo repositório.
- Nenhuma mutacao GitHub, push, release ou outra mutacao remota ocorreu durante a validacao.

## Evidencias

- `C:\Users\carlos\AppData\Local\Temp\opencode\ade-v6.0.8-negative-preflight.jsonl`
- `C:\Users\carlos\AppData\Local\Temp\opencode\ade-v6.0.8-engineering-host-validation.jsonl`
- `C:\Users\carlos\AppData\Local\Temp\opencode\ade-v6.0.8-final-observation.jsonl`
