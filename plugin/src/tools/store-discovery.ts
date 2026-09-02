/** Shared disk-store discovery for maintenance tools. */

import { readdir } from "fs/promises";
import { basename, dirname, join } from "path";
import { getDataHome } from "../utils/project-id";

const SHA40 = /^[0-9a-f]{40}$/;

export const CONSOLIDATION_LEDGER_FILENAME = "consolidation-ledger.jsonl";

export interface StoreDirRef {
  projectId: string;
  path: string;
  layout: "determinus" | "shard";
  shard: string | null;
}

export interface LayoutWalk {
  layout: "determinus" | "shard";
  root: string;
  exists: boolean;
}

async function readdirSafe(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}

/** Resolve the directory holding both legacy and per-project store layouts. */
export function defaultDataHomeRoot(): string {
  const dataHome = getDataHome();
  const leaf = basename(dataHome);
  const parent = basename(dirname(dataHome));
  if (parent === "opencode-projects" && SHA40.test(leaf)) {
    return dirname(dirname(dataHome));
  }
  return dataHome;
}

/** Enumerate discoverable Determinus stores without mutating or requiring them. */
export async function walkStoreDirs(dataHomeRoot: string): Promise<{
  stores: StoreDirRef[];
  layouts: LayoutWalk[];
}> {
  const stores: StoreDirRef[] = [];
  const layouts: LayoutWalk[] = [];

  const determinusRoot = join(dataHomeRoot, "opencode/plugins/determinus");
  const determinusNames = await readdirSafe(determinusRoot);
  layouts.push({
    layout: "determinus",
    root: determinusRoot,
    exists: await pathExists(determinusRoot),
  });
  for (const name of determinusNames) {
    stores.push({
      projectId: name,
      path: join(determinusRoot, name),
      layout: "determinus",
      shard: null,
    });
  }

  const shardsRoot = join(dataHomeRoot, "opencode-projects");
  layouts.push({
    layout: "shard",
    root: shardsRoot,
    exists: await pathExists(shardsRoot),
  });
  for (const shard of await readdirSafe(shardsRoot)) {
    const determinusRoot = join(
      shardsRoot,
      shard,
      "opencode/plugins/determinus",
    );
    for (const name of await readdirSafe(determinusRoot)) {
      stores.push({
        projectId: name,
        path: join(determinusRoot, name),
        layout: "shard",
        shard,
      });
    }
  }

  return { stores, layouts };
}
