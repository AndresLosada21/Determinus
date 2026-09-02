# Determinus 3.0.2 — clean OpenCode Beta installation

## Requirements

- Official OpenCode Beta already installed.
- Node.js 24 or later and `pnpm` available in PowerShell.

## Install

Extract the ZIP, open PowerShell in its extracted directory, and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install-opencode2.ps1
```

The installer validates the bundle, installs the plugin runtime dependencies in
the staged destination, deploys it to
`%USERPROFILE%\.local\share\Determinus\plugin`, and updates OpenCode's user
configuration. It does **not** patch, compile, rebuild, or need the source of
OpenCode.

Restart OpenCode Beta and begin a new session. Existing sessions retain their
previous chat history, so they cannot demonstrate the new prompt budget.

## Verify

In OpenCode, verify the component is `active` and start a short Plan request.
If you use the CLI wrapper, this is typically:

```powershell
opencode2 api get /api/plugin
```

The expected entry is Determinus with state `active`.

## Safe cleanup

After the replacement plugin is successfully staged, the installer moves only
known former Advance locations and `adv.md` into a timestamped backup under
`%USERPROFILE%\.local\share\Determinus\.backups`. It does not delete arbitrary
projects, OpenCode files, or user agents.
