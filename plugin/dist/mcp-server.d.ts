import { Readable, Writable } from 'node:stream';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

/**
 * ADV MCP stdio server entry point.
 *
 * Exposes a minimal read surface over the Model Context Protocol:
 *   - determinus_handshake: capability/version meta-tool
 *   - Tier-4 read tools (including project_context) dispatched through a
 *     narrow injected factory covering exactly the 13 catalog tools
 *
 * The server resolves the project id at startup, uses the plugin version as
 * its serverInfo.version, and never accepts per-call project_root overrides
 * (AC6 minimum, enforced by the security wrapper).
 */

interface StartServerOptions {
    stdin?: Readable;
    stdout?: Writable;
    /** Optional transport override for tests. When omitted, stdio is used. */
    transport?: Transport;
}
/**
 * Start the ADV MCP server on stdio (or the provided streams).
 *
 * Resolves the project id from `process.cwd()` and binds the read tools.
 * Does not block on external services at startup; each read tool lazily creates a
 * disk-only store when invoked via the generic dispatcher.
 */
declare function startServer(options?: StartServerOptions): Promise<void>;

export { type StartServerOptions, startServer };
