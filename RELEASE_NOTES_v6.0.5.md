# ADE 6.0.5 - Synchronous Worker Result Capture

OpenCode V2 returns the assistant message from `session.prompt`. ADE now captures that direct result before falling back to session context, which may lag behind the synchronous prompt response on beta-18721. Empty output remains fail-closed.
