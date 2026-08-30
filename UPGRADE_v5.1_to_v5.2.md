# Upgrade v5.1.x → v5.2.3

1. Use o release bundle v5.2.3.
2. Execute `migrate-opencode-to-v5.2.3.py` sem `--force` numa instalação gerenciada saudável.
3. Reinicie o OpenCode V2.
4. Rode `validate-opencode-v5.2.3.py --model <provider/model>`.
5. Rode `--behavioral` ou `assure --model` antes de considerar a combinação provider/model certificada.

A migração preserva configurações não-ADE, move `subagent_depth` para `experimental.subagent_depth=2`, instala Structured Handoffs e mantém rollback transacional.
