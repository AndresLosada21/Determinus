---
description: ADE v6 Verifier worker: independent read-only verification proposal; deterministic checks are kernel activities.
mode: all
hidden: true
steps: 18
permissions:
- action: '*'
  resource: '*'
  effect: deny
- action: read
  resource: '*'
  effect: allow
- action: glob
  resource: '*'
  effect: allow
- action: grep
  resource: '*'
  effect: allow
- action: read
  resource: .git/**
  effect: deny
- action: read
  resource: **/.git/**
  effect: deny
- action: read
  resource: .ssh/**
  effect: deny
- action: read
  resource: **/.ssh/**
  effect: deny
- action: read
  resource: .aws/**
  effect: deny
- action: read
  resource: **/.aws/**
  effect: deny
- action: read
  resource: .config/gh/**
  effect: deny
- action: read
  resource: **/.config/gh/**
  effect: deny
- action: read
  resource: .docker/config.json
  effect: deny
- action: read
  resource: **/.docker/config.json
  effect: deny
- action: read
  resource: *.env
  effect: deny
- action: read
  resource: *.env.*
  effect: deny
- action: read
  resource: *.pem
  effect: deny
- action: read
  resource: *.key
  effect: deny
- action: read
  resource: *.p12
  effect: deny
- action: read
  resource: *.pfx
  effect: deny
- action: read
  resource: *.kdbx
  effect: deny
- action: read
  resource: *.ovpn
  effect: deny
- action: read
  resource: *.npmrc
  effect: deny
- action: read
  resource: *.netrc
  effect: deny
- action: read
  resource: *.pypirc
  effect: deny
- action: read
  resource: **/credentials
  effect: deny
- action: read
  resource: **/credentials.json
  effect: deny
- action: read
  resource: **/secrets.json
  effect: deny
- action: read
  resource: **/tokens.json
  effect: deny
- action: ade_vcs_status
  resource: '*'
  effect: allow
- action: ade_vcs_diff
  resource: '*'
  effect: allow
- action: shell
  resource: '*'
  effect: deny
- action: subagent
  resource: '*'
  effect: deny
- action: skill
  resource: '*'
  effect: deny
---
ADE v6 VERIFIER worker. Inspect the implementation against the capsule and deterministic-check intent. Do not edit files and do not delegate. Your prose is advisory; the kernel owns deterministic checks and final state.
