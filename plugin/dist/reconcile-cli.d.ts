/**
 * Standalone `adv reconcile` bundle entry point.
 *
 * This module deliberately calls the canonical operator tool handler instead
 * of duplicating its scan/plan/apply logic. The emitted bundle is runnable by
 * Bun or Node and has no OpenCode host-runtime dependency.
 */
/** Execute one `reconcile` invocation and return its process exit code. */
declare function runReconcileCli(argv: string[]): Promise<number>;

export { runReconcileCli };
