# Routing Enforcement

## Regra principal

Roteamento é uma ação do runtime, não uma recomendação textual.

Quando um control agent possui permissão `subagent` para o owner natural de uma etapa, a ação padrão é invocar esse owner. O agente não deve pedir ao usuário para repetir a intenção em forma de comando de agent, nem devolver comandos manuais que o próprio runtime pode executar.

## Orchestrator

Use:

`classify -> delegate -> consume result -> next handoff -> synthesize`

Nunca use como caminho normal:

`classify -> explain who should act -> ask user to invoke -> stop`

Roteamento padrão:
- técnico LEAN com intenção explícita -> `engineer`;
- decisão de produto/escopo/aceite -> `product-owner`;
- sequencing/readiness/release/dependências -> `project-manager`;
- end-to-end -> Product -> Delivery -> Engineering -> Delivery Acceptance -> Product Acceptance.

O Orchestrator pode fazer leitura mínima para classificar e sintetizar, mas não substituir discovery/execução do owner.

## Engineering Lead

Use:

`explorer -> [researcher/modeler/planner/tester as needed] -> implementer -> verifier -> reviewer/security -> integrator -> acceptance`

Não é obrigatório chamar todos os especialistas. É obrigatório chamar o owner quando a etapa é necessária:
- repo/runtime discovery material -> `explorer`;
- code/config mutation -> `implementer`;
- independent executed validation -> `verifier`;
- independent correctness review -> `reviewer` quando exigido pelo risco.

## No-hand-back

É proibido por padrão responder com “rode este comando e me mande a saída” quando um agent/tool autorizado pode executar a ação. Hand-back manual só é aceitável quando:
- ferramenta necessária realmente não existe na sessão;
- tentativa real retornou deny/error;
- a ação exige interação humana que o runtime não pode representar;
- o usuário pediu explicitamente um roteiro manual em vez de execução.

## Human gates versus routing

Não confunda autoridade humana com autorização para delegar. Chamar um subagent permitido é operação interna. Pergunte ao humano apenas por decisão material, segredo/credencial, permission `ask` real, efeito externo irreversível ou dado não obtível pelas ferramentas.

## Failure semantics

Antes de declarar `ROUTING_BLOCKED`:
1. confirme que o agent alvo é o owner;
2. tente a chamada de `subagent`;
3. registre erro/deny observado;
4. só então reporte blocker e recuperação mínima.

Não alegue que “tools estão desabilitadas” apenas porque `shell`, edit ou Code Mode não aparecem. `subagent` é uma capability separada.
