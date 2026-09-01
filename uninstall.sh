#!/usr/bin/env bash
# Uninstall Determinus plugin (bash - macOS/Linux/Git Bash)
# Removes plugin entry from opencode.json, optionally purges deployed runtime
set -euo pipefail

CONFIG="${1:-$HOME/.config/opencode/opencode.json}"
PLUGIN_PATH=""
PURGE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --purge) PURGE=true; shift ;;
    --config) CONFIG="$2"; shift 2 ;;
    *) shift ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_PATH="${PLUGIN_PATH:-$REPO_ROOT/plugin}"
TILDE_PATH="~/.local/share/Determinus/plugin"
DEPLOYED="$HOME/.local/share/Determinus/plugin"

log(){ printf '==> %s\n' "$*"; }

if [[ ! -f "$CONFIG" ]]; then
  log "opencode.json not found: $CONFIG (nothing to do)"; exit 0
fi

# backup
BAK="$CONFIG.bak-uninstall-$(date +%Y%m%d-%H%M%S)"
cp "$CONFIG" "$BAK"
log "Backup: $BAK"

# use node to edit JSON safely (jq optional)
if command -v node >/dev/null 2>&1; then
  node --input-type=module -e "
import fs from 'fs';
const cfg=process.argv[1], plugin=process.argv[2], tilde=process.argv[3], deployed=process.argv[4];
let j=JSON.parse(fs.readFileSync(cfg,'utf8'));
if(!Array.isArray(j.plugins)){console.log('No plugins key');process.exit(0)}
const before=j.plugins.length;
j.plugins=j.plugins.filter(p=>p!==plugin && p!==tilde && p!==deployed);
if(j.plugins.length===0) delete j.plugins;
fs.writeFileSync(cfg, JSON.stringify(j,null,2)+'\n');
console.log('Removed '+(before-(j.plugins?j.plugins.length:0))+' entry(ies)');
" "$CONFIG" "$PLUGIN_PATH" "$TILDE_PATH" "$DEPLOYED"
else
  log "node not found - cannot edit JSON safely"; exit 1
fi

if $PURGE && [[ -d "$DEPLOYED" ]]; then
  log "Purging $DEPLOYED"
  rm -rf "$DEPLOYED"
fi

log "Restarting service..."
opencode2 service restart 2>&1 || true
sleep 3
opencode2 service status 2>&1 || true
log "Determinus uninstalled."
