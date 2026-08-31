# Compatibility — ADE v5.2.7

| ADE | OpenCode | Python | Estado |
|---|---|---:|---|
| 5.2.7 | V2 Promise plugin API | 3.9+ | source/lifecycle validated; runtime revalidation pending |
| 5.2.7 | `opencode2 beta-18707` Windows | 3.9+ | target observed in real validation; re-test required after this fix |
| 5.2.6 | V2 Promise plugin API | 3.9+ | superseded by 5.2.7 Windows/Zen compatibility fix |

## Upgrade inputs aceitos

Migrator aceita instalações gerenciadas v4.x, v5.0.x, v5.1.x e v5.2.0–v5.2.6. O caminho recomendado desta release é `5.2.6 → 5.2.7`.

## API V2 usada

- `Plugin.define` Promise contract, com raw-default adapter para SDK beta sem named export;
- session-scoped Location via `session.get`;
- `session.hook("context")` para capability visibility e generation budget;
- `session.hook("http.request")` para compatibility normalization imediatamente antes do provider;
- `session.hook("retry")` para circuit breaker bounded;
- commands synthetic para diagnostics/metrics e `/ade-authorize`.

## Zen free model compatibility (v5.2.7)

O runtime real em Windows mostrou upstream `invalid_request_error` quando subagent requests usavam `tool_choice=required/named` contra modelos Zen free auto-only. v5.2.7 aplica um shim **somente** aos modelos declarados em `plugin/capabilities.json::provider_compat.auto_only_tool_choice_models` e ao provider/host OpenCode Zen:

- `required` ou named choice → `auto`;
- `none` → remove `tool_choice` **e `tools`**, preservando a semântica no-tools;
- `auto` → sem mudança;
- provider/model desconhecido → sem mudança;
- body não JSON/oversized → sem mudança.

A normalização altera somente o wire request ao provider. As capabilities ADE, permission hooks, exact-effect grants e deterministic guards continuam bloqueantes.

## Windows grant identity parity

`project_hash` usa `realpath` com normalização case-insensitive no Windows. Os testes de grants agora exercitam `/ade-authorize` real nos cenários de sucesso, em vez de fabricar grants com um helper divergente. Isso elimina a falsa divergência 73/79 observada no Windows v5.2.6.

## Authorization boundary

Project policy define escopo máximo, não autoridade. Mutações `HUMAN_REQUIRED` exigem `EXPLICIT_EXTERNAL_GRANT` single-use fora do projeto, com exact-effect fingerprint e TOCTOU revalidation. `--auto`/saved `always allow` não substituem o grant.

## GitHub Projects V2

O adapter determinístico continua responsável por snapshot, batch sync, field/option/iteration resolution, write, read-back e verification. Tracker Operator é fallback, não caminho crítico normal.
