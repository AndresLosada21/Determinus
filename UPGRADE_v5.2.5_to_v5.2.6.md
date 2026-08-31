# Upgrade v5.2.5 → v5.2.6 Hardened

## O que muda

- **Human authorization boundary**: mutações de alto impacto (`tracker sync/write`, `vcs stage/commit/push/pr_create`, `project-check`/`diagnostic-check` com host process) agora exigem `ask` (permissão humana). Leituras permanecem `allow`.
- Policy do repositório (`authorized=true`) não substitui `ask`. Em `opencode --auto`, `ask` vira `AUTO_APPROVED` (não humano) — comportamento fail-closed documentado.
- Novo grupo de regressão `human-authorization-boundary` e 22 novos testes Node (total 51).

## Pré-requisitos

- OpenCode V2 `beta-18684` (ou compatível) com `experimental.subagent_depth=2`.
- Python 3.9+.

## Migração direta

```powershell
# a partir da raiz do source v5.2.6 (este pacote)
py -B .\tooling\ade.py migrate --target "$HOME\.config\opencode"
# ou via shim
.\migrate-v4-to-v5.ps1  # aceita 5.2.5 → 5.2.6
```

O migrator valida `39/39` grupos, verifica `manifest schema 7`, preserva `agents/plugim/runtime/tooling` com `sha256` e exige `--force` se arquivo gerenciado foi modificado manualmente. Após sucesso, `INSTALL_V5_2_6_OK` + `MIGRATION_TO_V5_2_6_OK`.

Reinicie o OpenCode e rode:

```powershell
py -B .\tooling\ade.py validate --model "opencode/muse-spark-1.2-contributor-free"
# ou
py -B .\validate-opencode.ps1 -Model "opencode/muse-spark-1.2-contributor-free"
```

Core+Contract devem passar; behavioral canary permanece separado (`--behavioral`).

## Rollback seguro

```powershell
py -B .\tooling\ade.py uninstall --target "$HOME\.config\opencode"
# ou restaure backup em ~/.config/opencode/.ai-driven-backups/<stamp>/prior
```

O rollback de `v5.2.6 → v5.2.5` restaura `agents/*.md` byte-a-byte se o manifesto anterior estiver em `~/.config/opencode/ai-driven-engineering-install.json` com hashes originais. Arquivos convertidos em symlink/reparse são recusados (`UNSAFE_PATH`).

## Verificações manuais

- `agentes`: `project-manager` `ade_tracker_project_sync: ask`, `tracker-operator` `ade_tracker_write: ask`, `verifier` `ade_project_check: ask`, `debugger` `ade_diagnostic_check: ask`, `vcs-operator` `stage/commit/push/pr_create: ask`.
- `plugin/src/index.ts`: `HUMAN_AUTHORIZATION_REQUIRED` + `ADE_HUMAN_AUTHORIZATION_REQUIRED` + `AUTO_APPROVED` vs `USER_APPROVED`.
- `HARDENING.md` descreve limitação de `--auto`.

## Checklist pós-upgrade

- [ ] `tooling/ade.py regression` → 39/39 PASS
- [ ] `plugin/npm test` → 51/51 PASS
- [ ] `plugin/npm run typecheck` → PASS
- [ ] `validate --model <model>` → Core+Contract PASS
- [ ] Tracker sync em projeto real exige prompt `ask` (confirme que `authorized=true` sozinho não executa)
