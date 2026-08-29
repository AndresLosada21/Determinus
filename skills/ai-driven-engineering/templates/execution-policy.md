# Execution Policy

Profile: STANDARD

## Approved project commands
Document commands the human/Engineering Lead considers safe and expected for this repository. This file is guidance; OpenCode tool permissions remain the enforcement boundary.

- test:
- lint:
- build:
- format:
- migrations:

## Forbidden / high-risk actions
- destructive filesystem operations
- credential/secret access
- git push/force-push
- production deployment without explicit human authority
