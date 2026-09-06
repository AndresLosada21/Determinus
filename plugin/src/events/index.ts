/**
 * Events Module
 *
 * Status markers and terminal utilities for Determinus plugin.
 */

// Terminal utilities
export { getProjectName, buildTabTitle } from "./terminal";

// Status management
export {
  initializeStatus,
  setStatus,
  setActiveChange,
  getStatus,
  cleanup,
  pruneStaleRetries,
} from "./status";
