# Wire production enforcement

## Scope
- ST-11: fingerprint de conteudo (hash do arquivo de teste via extractTestFilePath; fallback cmd:; regra de origem em fingerprintsCompatible).
- ST-12: fiar oracle (contrato metadata red_oracle_*) + current_spec_revision dos documentos vivos no checkpoint; pairing inalterado.
- ST-13: renderizar active_slice no pacote (builder + registro por lane).
- ST-14: strip ANSI + preferencia por linha de assercao no sinal de falha.

## Exclusions
- Sem adapter generico, sem hard guard, sem grafo, sem mudar lifecycle 7 gates, sem fingerprint semantico por framework, sem nova tool de TestCase.

## Acceptance criteria
- Cada story com demo ao vivo RED->GREEN (runs tr_*); pnpm check verde; test.test.ts sem fails novos (teto 20); budget sem regressao; manifest regenerado por ultimo; GH#13-#17 fechadas com evidencia.

## Error handling / rollback
- Fingerprint sem origem ou origens distintas => compativel (conservador, sem STALE espurio).
- documents ausente => hash estavel, sem STALE falso. Rollback: revert do checkpoint + re-prova.