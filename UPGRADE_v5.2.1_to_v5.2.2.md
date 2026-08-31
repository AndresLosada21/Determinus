# Upgrade v5.2.1 → v5.2.4

Esta é uma release de consolidação. Ela substitui os hotfixes aplicados diretamente em `~/.config/opencode` por source gerenciado e reproduzível.

```powershell
py -B .\migrate-opencode-v5.2.1-to-v5.2.4.py
opencode2 service restart
py -B .\validate-opencode-v5.2.4.py --model "opencode/muse-spark-1.2-contributor-free"
py -B .\assure-opencode-v5.2.4.py --source --model "opencode/muse-spark-1.2-contributor-free"
```

O primeiro comando deve migrar sem edição manual de `~/.config/opencode`. O validator pode usar retry limitado apenas para a pequena race de `plugin list` após restart. O `assure` é o gate final e deve terminar em `BEHAVIORAL_EVALS_VALIDATED` + `RELEASE_ASSURANCE_VALIDATED` para certificar o provider/model.
