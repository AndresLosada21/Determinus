# Add high-ROI enforcement

## Scope
- P1: TestCase filho de Task com red_oracle; run_test persiste fingerprint+failure_class; checkpoint valida oracle+fingerprint (tdd-ordering.ts, test.ts, checkpoint.ts).
- P2: TestRun com spec_revision+workspace_snapshot; STALE read-only; checkpoint+execution ignoram STALE (test.ts, checkpoint.ts, gate.ts, storage).
- P3: buildSliceContext puro sobre context-snapshot.ts; wiring em briefingPacket + 9 comandos + diretiva determinus.md.

## Exclusions
- Sem adapter generico, sem hard mutation guard, sem grafo completo, sem event-sourcing, sem mudar lifecycle 7 gates, sem novo agente.

## Acceptance criteria
- RED falso nao conta; teste enfraquecido invalida RED; bump spec torna STALE; briefingPacket fatiado sem regressao budget/cache.
- pnpm check verde em plugin/; manifest regenerado por ultimo; push origin/main; GH #9-#12 fechados com evidencia.

## Error handling / rollback
- Fingerprint diverge -> RED_STALE + TASK_ORDERING_VIOLATION ate re-provar; sem auto-revalidacao.
- Se tree SHA indisponivel -> digest + git diff --check fallback.
- Se migracao store travar -> corte para stale read-only.
- Rollback: git revert do checkpoint + re-run red->green; journal/recibo preservados.