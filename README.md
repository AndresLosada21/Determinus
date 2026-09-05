# Determinus 3.0.4

Correção de headers Go/Zen, preservação de contexto e instalação transacional para o OpenCode Beta oficial. Pacote compilado com dependências incorporadas.

- `INSTALL.md`: instalação, reinício, validação e rollback.
- `TOKEN_GUARD_PLAN.md`: diagnóstico, implementação, alcance e limites.
- `VALIDATION.json`: resultados dos testes e da instalação isolada.
- `AUDITORIA-ANTERIOR.md`: defeitos comprovados na versão anterior.
- `plugin/src` e `plugin/scripts`: código-fonte e testes.

Foram executados 274 testes selecionados e nove verificações do pacote em ambiente isolado. A suíte integral do repositório não foi executada. Um teste antigo que exigia o documento de slash command v1 removido foi retirado; as verificações de lógica de finalização permaneceram. Os testes de finalização usam timeout de 30 segundos para os subprocessos Git locais.

Não houve acesso ao Windows de Carlos nem chamadas pagas à conta Go/Zen. As observações positivas do teste do validador são fixtures explicitamente simuladas; a comprovação real deve ser feita depois da instalação.

## Reproduzir o build para desenvolvimento

Dentro de `plugin` (isso não é necessário para instalar):

```sh
pnpm install --frozen-lockfile --config.manage-package-manager-versions=false
node --import tsx scripts/build-plugin.ts
node --import tsx scripts/write-build-identity.ts
node --import tsx scripts/build-installers.ts
node --import tsx scripts/write-release-manifest.ts
pnpm run test:cache
pnpm run typecheck
```

Testes de regressão selecionados:

```sh
pnpm exec vitest run src/__tests__/prompt-compaction.test.ts src/tools/archive-helpers/git-finalize.test.ts src/tool-registry.test.ts src/tool-registry.surface.test.ts src/tool-registry.inventory.test.ts src/plugin-output.test.ts src/plugin-bundle-manifest.test.ts src/utils/tool-output.test.ts --project unit --maxWorkers=2 --testTimeout=30000
```

Os checksums verificam integridade do conjunto recebido; não constituem uma assinatura digital de um editor externo.
