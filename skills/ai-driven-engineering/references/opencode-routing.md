# Routing ADE v5.2

`STATE_DRIVEN` substitui `DELEGATE_FIRST` como regra principal.

- Orchestrator chama PO/PM/Engineer apenas quando a autoridade daquele plano é necessária.
- PM chama `tracker-operator` somente para operação real de tracker.
- Engineer chama leafs apenas quando discovery/implementação/verificação/review realmente exigem.
- Não reconfirmar owner sem mudança relevante de revision/inputs.
- Erro determinístico idêntico não deve gerar retry de subagent sem estratégia diferente.
- `experimental.subagent_depth: 2` permite owner -> leaf.
- Handoffs são compactos; audit detalhado fica fora da conversa principal.
