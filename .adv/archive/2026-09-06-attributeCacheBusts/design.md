# Design — bust attribution (ST-15)

## Achados beta (subagent ses_f8bf3b14)
- Breakpoints: packages/ai/src/cache-policy.ts (CAP 4, tools->system->messages); anthropic-messages.ts EPHEMERAL_5M/1H; sem header prompt-caching.
- Prefixo: session/model-request.ts monta system=[agent.system||SessionSystemPrompt,initial]+messages+tools; plugin/system-prompt.ts:46 muta system[0]; skills injetadas no user content; tool add/remove/reorder busta tudo abaixo; compaction reescreve.
- Uso: message.tokens{input,cache.read/write} + time.created/completed. Sem API de causa de bust.
- Plugin PODE: tool.execute.before/after, session hooks, event.subscribe, byte sizes, gaps, deltas de cache.read.

## Desenho
- Modulo puro src/utils/cache-bust-attribution.ts: appendStep({tool,bytesIn,bytesOut,at,newTokens,cachedTokens}) -> detecta queda de cached alem de limiar -> evento {suspect, evidence[], cause: ours|host|unknown}.
- Heuristicas: output>50KB unico => ours; gap>4.5min => host(ttl); cwd/session-dir mudou => ours(move); tool-count mudou => ours(tools); senao unknown.
- Coletor: fiar no que o NOSSO SDK expoe (verificar ctx tool/session/event em plugin/src/index.ts); se host nao expoe uso por step, coletor opera em modo degradado (só bytes+gaps) sem quebrar boot — mesma disciplina fail-soft do plugin.
- Expor: agregar em diagnostics/cache-*.json (top busts) + teste de borda do limiar.