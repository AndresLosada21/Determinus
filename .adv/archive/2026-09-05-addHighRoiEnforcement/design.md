# Design — Alto-ROI

## Direcao suportada
Manter core Change+Task+TestRun+7 gates; TestCase como filha de Task (nao substitui Task).

## P1 red_oracle+fingerprint
- red_oracle antes do run: {expected_outcome:failure, allowed_failure_class:assertion_failure, expected_signal}.
- run_test persiste test_definition_fingerprint (hash normalizado arquivo+seletor) + failure_class + failure_fingerprint.
- checkTddOrdering estendido: RED exige outcome FAILED+classe+sinal+nao-infra; GREEN exige mesmo TestCase+fingerprint compativel+apos RED; diverge -> RED_STALE.
- Adapter v1 = hash normalizado conservador; existing_reproduction permitido se ligado ao Scenario; not_applicable exige reason+alternative.

## P2 stale
- TestRun: spec_revision (hash proposal+agreement+design) + workspace_snapshot (commit/tree SHA, fallback digest).
- Bump => STALE read-only (sem migracao); checkpoint+pairing ignoram STALE.
- Baseline por slice para falha antiga nao virar RED.

## P3 projecao
- buildSliceContext puro sobre buildChangeContextSnapshot; injeta em briefingPacket + 9 comandos + diretiva; skills seguem guidance.
- Formato: ACTIVE SLICE|SCENARIO|DESIGN|TESTCASE|STATE|ALLOWED|FORBIDDEN.

## Cortes
- Sem SHA => digest+diff-check; sem migracao => read-only; budget estoura => cortar campos.