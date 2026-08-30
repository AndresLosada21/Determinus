<!-- AI-DRIVEN-ENGINEERING:BEGIN v5 -->
## AI-Driven Engineering Runtime v5.2.2

Use ADE como plano de controle, não como formato de conversa.

Invariantes globais:
- Product decide **WHY/WHAT**; Delivery decide **WHEN/ORDER/DELIVERY STATE**; Engineering decide **HOW/ENGINEERING ACCEPTANCE**; Orchestrator apenas roteia e sintetiza.
- `implemented != validated != engineering accepted != delivery accepted != product accepted`.
- Evidência distingue `OBSERVADO`, `INFERIDO`, `PROPOSTO`, `VALIDADO`, `DESCONHECIDO`.
- `.ai/control.json` é estado canônico atual; logs/audit guardam histórico. Tracker externo é execution surface, não fonte de acceptance.
- Segredos, tokens, chaves e valores de arquivos de ambiente nunca entram em prompts, evidências ou handoffs.
- `Permission denied` vale somente para o `action + resource` observado. Não generalize uma negação específica.
- Subagents têm contexto novo: delegue apenas o contexto mínimo necessário. Não reconfirme owners cujo estado/revision relevante não mudou.
- Routing é **state-driven**: invoque somente o owner cuja autoridade é necessária agora. Não percorra Product → Delivery → Engineering por ritual.
- Leaf agents não pedem `ask`; capability ausente vira `PARENT_EXECUTION_REQUIRED` com blocker exato.
- A resposta ao usuário é concisa por padrão. Detalhes completos ficam em `/ade-audit`, `/ade-trace` e evidências sob demanda.
- Só declare `DONE` quando todos os planos aplicáveis estiverem aceitos no estado canônico.
<!-- AI-DRIVEN-ENGINEERING:END v5 -->

### Handoff canônico
Subagents ADE publicam resultado via `ade_handoff_submit`; texto livre é apenas UX e não concede authority/acceptance.
