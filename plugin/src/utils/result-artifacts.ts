import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
/** Full local evidence is saved before reducing any producer result. */
export function persistResult(text: string, scope = "tools"): string {
  if (!/^[a-z0-9-]+$/i.test(scope))
    throw Error("Invalid result artifact scope");
  const dir = join(homedir(), ".local/share/Determinus/tool-results", scope);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(
    dir,
    createHash("sha256").update(text).digest("hex") + ".json",
  );
  writeFileSync(file, text, { mode: 0o600 });
  const result = JSON.parse(text);
  const plain =
    typeof result?.content === "string"
      ? result.content
      : Array.isArray(result?.content)
        ? result.content
            .filter((x: any) => x?.type === "text")
            .map((x: any) => x.text)
            .join("\n")
        : (result?.message ??
          result?.output ??
          JSON.stringify(result?.structured ?? result, null, 2));
  writeFileSync(
    file + ".txt",
    typeof plain === "string" ? plain : JSON.stringify(plain, null, 2),
    { mode: 0o600 },
  );
  return file;
}
