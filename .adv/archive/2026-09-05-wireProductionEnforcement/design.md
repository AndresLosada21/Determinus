# Design — fiação de produção

## ST-11 fingerprint de conteúdo
- Novo: normalizeTestContent (strip ANSI, CRLF->LF, trim por linha, drop vazias) + resolveTestFile via extractTestFilePath.
- fp=file:<sha12> quando resolvido; fp=cmd:<sha12> fallback. fingerprintsCompatible só compara mesma origem.

## ST-12 fiação oracle+rev
- Contrato metadata: red_oracle_class/signal/required documentado no prep + skill sdd-tdd (guidance).
- Checkpoint: current_spec_revision = computeSpecRevision(live documents via loadChange); oracle de metadata (inalterado).
- Pairing inalterado (decisão registrada na issue).

## ST-13 render slice
- Investigar SectionKind/LANE_SECTIONS; preferir sub-bloco de tasks se novo kind exigir bump de schema; fortalecer teste p/ presença.

## ST-14 sinal robusto
- stripAnsi único ponto (combinedOutput) + preferência por linha de asserção + fallback última linha; taxonomia intacta.