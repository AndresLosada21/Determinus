# Validation — ADE v5.2.3

## A. Source/static — determinística

Antes de empacotar:
- 34 grupos Python;
- 26 testes Node;
- TypeScript `tsc --noEmit`;
- 18 agents / 26 typed tools;
- structured handoff ownership/schema/limits;
- lifecycle mock com handoff persistence e authority rejection;
- evidence/state hardening;
- state-driven routing;
- telemetry privacy + cost intelligence;
- bounded provider retry;
- installer/migrator/uninstaller safety.

## B. Core runtime — bloqueante para operação

`validate --model` prova no host:
1. manifesto instalado;
2. plugin ativo;
3. provider baseline;
4. catálogo ADE aceito;
5. `orchestrator -> ade_status` executado realmente;
6. `experimental.subagent_depth=2` resolvido.

## C. Contract Assurance — determinística e obrigatória no validate

Sempre roda, com ou sem `--behavioral`:
- 26 tools instaladas;
- Orchestrator não recebe handoff-submit;
- 17 child/owner agents recebem `ade_handoff_submit`;
- agent instructions exigem exactly-one handoff + resposta curta;
- schema 4 KiB / 8 refs / 8 changed / recent=3;
- plugin contém authority enforcement, durable handoff log e telemetry privacy markers.

Marcadores:

```text
HANDOFF_CONTRACT_VALIDATED
EFFICIENCY_CONTRACT_VALIDATED
CONTRACT_ASSURANCE_VALIDATED
```

## D. Behavioral Canary — model-driven

`validate --model ... --behavioral` executa canaries no provider/model real. Não valida frases literais; valida comportamento observável:
- subagent correto;
- `ade_handoff_submit` chamado exatamente uma vez por child/owner esperado;
- status/required_owner/next corretos;
- ausência de tools extras proibidas;
- resposta abaixo do budget de texto.

Falha é real behavioral regression para aquela combinação host/provider/model.

## E. Release Assurance

```powershell
py -B .\assure-opencode-v5.2.3.py --source --model "provider/model"
```

Com `--model`, behavioral canary é executado por padrão. Só então sai:

```text
RELEASE_ASSURANCE_VALIDATED: core + contract + behavioral canary
```

`--core-only` é diagnóstico; imprime `RELEASE_ASSURANCE_NOT_CLAIMED`.

## Delegation-driven behavioral reliability (v5.2.3)

Behavioral canaries remain strict. To measure provider/model consistency across repeated trials without relaxing any assertion:

```powershell
py -B tooling/ade.py behavioral-reliability --model "provider/model" --trials 5
```

Add `--strict` to return a failing exit code if any trial fails. A reliability report is diagnostic and does not replace `assurance --model`.
