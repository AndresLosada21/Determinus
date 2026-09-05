# Determinus 3.5.0 — OpenCode Beta oficial

O ZIP inclui código-fonte, testes, plugin compilado, instalador e validador. Não modifica nem recompila OpenCode. Requer Node.js 24 ou superior. A instalação não depende de pnpm, bash, WSL, rsync, jq ou download de dependências.

## Instalar

Extraia o ZIP e abra PowerShell na pasta `Determinus-3.5.0`:

```powershell
.\install-opencode2.ps1
```

Se o projeto tiver registro local de uma versão antiga, informe sua raiz:

```powershell
.\install-opencode2.ps1 -Project 'C:\caminho\do\projeto'
```

Feche e reabra o OpenCode/reinicie seu serviço após instalar. Uma sessão já aberta pode continuar executando o código antigo. Não precisamos do caminho do código-fonte do Beta.

`-DryRun` mostra o destino e as configurações antes de gravar. `-ConfigDir` e `-ConfigFile` aceitam configurações personalizadas; o instalador também respeita `OPENCODE_CONFIG_DIR` e `OPENCODE_CONFIG`. Se `OPENCODE_CONFIG_CONTENT` impuser plugins ou desativar compactação, o instalador interrompe antes da gravação: mova essas definições para o arquivo de configuração. Nenhuma chave de API é exibida.

Alternativa ao wrapper PowerShell:

```powershell
node .\install.mjs --project 'C:\caminho\do\projeto'
```

## Comportamento da instalação

- Confere SHA-256 e importa o bundle antes de alterar a configuração. O entrypoint `plugin/index.ts` importa `dist/index.js`; SDK e dependências de runtime estão incorporados. Não execute `pnpm install` na pasta implantada.
- Instala em `%USERPROFILE%\.local\share\Determinus\releases\3.5.0-<hash>`. Cada pacote recebe diretório próprio. A configuração aponta explicitamente para esse entrypoint.
- Atualiza a chave Beta `plugins`; preserva comentários JSONC, providers, credenciais e plugins de outros produtos. Ativa `compaction.auto: true`.
- Instala apenas o agente compacto `determinus.md`. Retira para backup registros antigos reconhecidos, entradas automáticas Determinus/Advance, `adv.md` e antigos comandos/skills `determinus-*`. Não instala o Advance nem importa seu estado.
- A limpeza se limita às pastas de configuração. `plugins/` na raiz de um projeto pode conter código-fonte e não é movida. O instalador não percorre todos os seus projetos; use `-Project` nos que têm configuração local própria.
- Journal, backups e recibo permitem restauração após falha e recuperação na próxima execução após interrupção de processo. Edições concorrentes são preservadas, com erro explícito em vez de sobrescrita.

Dados de changes e sessões em `.local\share\opencode\plugins\determinus` permanecem no lugar. A instalação não migra `.local\share\opencode\plugins\advance` e não apaga repositórios, worktrees ou sessões. Retirar registros antigos da configuração não significa apagar todo código-fonte antigo do disco.

## Verificar a versão efetiva e o cache

Depois de reiniciar, faça ao menos dois turnos normais na mesma sessão Go e execute:

```powershell
.\validate-opencode2.ps1 -Require go
```

Para conferir Zen, use `-Require zen`; para conferir ambos depois de utilizar ambos, `-Require 'go,zen'`. Se o executável tiver outro nome, informe `-Cli 'C:\caminho\opencode2.exe'` ou `node .\validate.mjs --cli NOME --require go`.

A validação exige: arquivos íntegros; plugin ativo no endpoint local `/api/plugin` com o entrypoint instalado; diagnóstico da mesma geração em processo vivo; respostas 2xx com identificação e User-Agent; mesma identidade observada mais de uma vez; eventos nativos de uso atribuídos ao serviço solicitado e cache lido. Instalação bem-sucedida, sozinha, não passa como prova de cache.

O código de saída **2**, `DETERMINUS_VALIDATION_PENDING`, significa que falta evidência. Uma conversa curta, expiração, troca de modelo ou compactação pode resultar em zero cache. Não gere textos enormes só para aprovar o teste: utilize turnos normais de trabalho. O código **0**, `DETERMINUS_RUNTIME_AND_CACHE_OBSERVED`, comprova somente as observações daquela geração e período.

Diagnósticos pequenos ficam em `%USERPROFILE%\.local\share\Determinus\diagnostics\cache-*.json`. Contêm contagens, versão, geração, hashes e presença dos headers; não contêm prompt bruto, chave ou corpo HTTP. Resultados completos de ferramentas ficam separados em `tool-results`, em JSON e texto, e podem conter dados privados do projeto. Para investigar headers, envie apenas a saída do validador e o diagnóstico pequeno relevante.

## Desfazer

```powershell
.\install-opencode2.ps1 -Rollback
```

Reinicie o OpenCode depois. Restaura a última configuração/agentes retirados, preservando releases e estado de trabalho. Reinstalações repetidas são suportadas e criam novos backups.

## Limites

Validado ao vivo em Windows + Node 24 contra o Beta real (`opencode2` beta-19151): instalação ativa, uso Go observado com `repeatedSession: true` e `cacheReadTokens: 301554`, e ciclo SDD+TDD completo com evidência RED→GREEN. Veja `VALIDATION.json` para a evidência. Não há promessa de zero cache miss.
