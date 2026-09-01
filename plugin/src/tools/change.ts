/**
 * Change tools barrel.
 *
 * Handler implementations live in focused modules; this file preserves the
 * public changeTools surface and export compatibility.
 */
import { archiveChangeTools } from "./change/handlers-archive";
import { lifecycleChangeTools } from "./change/handlers-lifecycle";
import { queryChangeTools } from "./change/handlers-query";
import { miscChangeTools } from "./change/handlers-misc";

// Keep routine-read guard boundaries discoverable in this barrel. The actual
// handler implementations remain in handlers-query.ts.
// determinus_change_list: {
//   execute: queryChangeTools.determinus_change_list.execute,
// },
// determinus_change_show: {
//   execute: queryChangeTools.determinus_change_show.execute,
// },
// determinus_change_create: {

export const changeTools = {
  determinus_change_list: queryChangeTools.determinus_change_list,
  determinus_change_show: queryChangeTools.determinus_change_show,
  determinus_change_create: lifecycleChangeTools.determinus_change_create,
  determinus_change_update: lifecycleChangeTools.determinus_change_update,
  determinus_change_close: lifecycleChangeTools.determinus_change_close,
  determinus_change_archive: archiveChangeTools.determinus_change_archive,
  determinus_change_reenter: miscChangeTools.determinus_change_reenter,
};

export { CHANGE_VALIDATE_CONTEXT_TIMEOUT_MS } from "./change/helpers";
export { saveRecoveredArchiveConvergence } from "./change/helpers";
export type {
  ArchiveConvergenceRefusalCode,
  SaveRecoveredArchiveConvergenceResult,
} from "./change/helpers";
export {
  readArtifact,
  readArtifacts,
  loadProposalForContext,
} from "./change/artifacts";
export { closeLinkedIssue } from "./change/recovery";
