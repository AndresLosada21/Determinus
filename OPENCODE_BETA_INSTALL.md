# Instalação no OpenCode Beta oficial

1. Feche o OpenCode Beta.
2. Extraia este pacote e execute no PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install-opencode2.ps1
```

3. Abra novamente o OpenCode Beta e execute:

```powershell
.\scripts\validate-opencode2-runtime.ps1
```

O instalador instala somente o plugin Determinus, seus comandos e o agente
`determinus`. Ele não altera, compila ou substitui o OpenCode oficial.

O instalador também instala as dependências dentro do diretório implantado antes
de ativá-lo. Isso é obrigatório porque o OpenCode carrega `plugin/index.ts` e
resolve `@opencode-ai/plugin` a partir dessa pasta.

O estado novo fica em `~/.local/share/opencode/plugins/determinus/`. O estado
do Advance é retirado da área ativa e guardado em backup, sem migração ou leitura
pelo Determinus.
