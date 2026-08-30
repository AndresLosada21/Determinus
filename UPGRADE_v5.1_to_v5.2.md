# Upgrade v5.1.x -> v5.2.0

1. Corrija primeiro qualquer `Bun os error 1455` com `diagnose-windows-pagefile.ps1`; reinicie o Windows se alterar memória virtual.
2. Execute `migrate-opencode-to-v5.2.0.py` do release bundle. Não use `--force` numa instalação gerenciada saudável.
3. Reinicie `opencode2 service`.
4. Rode `validate-opencode-v5.2.0.py --model <provider/model>`.
5. Só rode `--behavioral` depois que o core runtime estiver verde.

A migração:
- preserva arquivos não-ADE e settings `experimental` não relacionados;
- move nesting para `experimental.subagent_depth=2`;
- substitui arquivos gerenciados somente se ainda correspondem ao manifesto anterior;
- grava manifesto schema 7 e backup;
- não altera `.ai/` de projetos existentes. O plugin normaliza estado/evidência legado quando o projeto é acessado/escrito.

## Mudança comportamental importante

`DELEGATE_FIRST` deixa de existir como regra principal. O Orchestrator passa a `STATE_DRIVEN`: owners só são chamados quando sua autoridade/state transition é necessária.
