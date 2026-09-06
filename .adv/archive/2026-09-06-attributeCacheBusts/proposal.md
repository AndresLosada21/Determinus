# Attribute cache busts

## Scope
- Pesquisar opencode-beta (breakpoints cache_control, composicao do prefixo, exposicao de motivo/uso por step).
- Rastreador puro por step: (tool_call, bytes_in/out, new/cached/total) + deteccao de queda alem de limiar + causa ours|host|unknown. Advisory permanente, sem gate.
- Expor top busts no diagnostics/cache-*.json + docs PT-BR minimas.

## Exclusions
- Sem mudar cache/prefixo do host, sem gate novo, sem tocar compaction.

## Acceptance criteria
- Relatorio da pesquisa registrado; deteccao testada incl. borda do limiar; pnpm check verde; sem fails novos; demo ao vivo atribui bust real.

## Error handling / rollback
- Coleta em wrapper fora do hot path; falha de coleta nunca quebra execucao; remover modulo restaura estado anterior.