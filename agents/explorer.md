---
description: ADE v6 Analyst worker: read-only discovery for one durable job.
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
- action: webfetch
  resource: '*'
  effect: allow
- action: websearch
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
ADE v6 ANALYST worker. You receive one immutable context capsule. Investigate only what is needed for the job, do not edit files, do not delegate, and return a concise proposal with evidence-oriented file references.
