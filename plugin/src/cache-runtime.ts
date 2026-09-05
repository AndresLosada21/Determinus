import { createHash } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getLoadedPluginBundleGeneration } from "./plugin-bundle-manifest";
import { persistResult } from "./utils/result-artifacts";
import {
  CACHE_RELEASE,
  createCacheGateway,
  goZenURL,
  type TransportSample,
} from "./cache-transport";
const RESULT_LIMIT = 6000,
  CONTEXT_LIMIT = 96000;
const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
/** Reduce fresh producer output only. Never rewrite user text or replay. */
export function containResult(
  tool: string,
  result: any,
  persist: (text: string) => string,
): any {
  if (!isRecord(result) || /(?:^|[._/])skill$/i.test(tool)) return result;
  const serialized = JSON.stringify(result);
  if (serialized.length <= RESULT_LIMIT) return result;
  const path = persist(serialized);
  const texts =
    typeof result.content === "string"
      ? result.content
      : Array.isArray(result.content)
        ? result.content
            .filter((x: any) => x?.type === "text")
            .map((x: any) => x.text)
            .join("\n")
        : "";
  const excerpt =
    texts || JSON.stringify(result.structured ?? result.output ?? {});
  const summary = `Determinus: full ${tool} result (${serialized.length} characters) saved at ${path}. Decoded text: ${path}.txt. Extract only relevant ranges.\n${excerpt.slice(0, 2600)}\n…\n${excerpt.slice(-1200)}`;
  const nonText = Array.isArray(result.content)
    ? result.content.filter((x: any) => x?.type !== "text")
    : [];
  const essential: Record<string, unknown> = {};
  if (isRecord(result.structured))
    for (const key of [
      "success",
      "ok",
      "status",
      "code",
      "id",
      "changeId",
      "taskId",
      "gateId",
      "exitCode",
    ]) {
      const v = result.structured[key];
      if (
        ["boolean", "number"].includes(typeof v) ||
        (typeof v === "string" && v.length < 200)
      )
        essential[key] = v;
    }
  return {
    ...result,
    content: [{ type: "text", text: summary }, ...nonText],
    ...(typeof result.output === "string" && result.output.length > RESULT_LIMIT
      ? { output: summary }
      : {}),
    ...(result.structured !== undefined
      ? {
          structured: {
            ...essential,
            _determinus: { fullResult: path, truncated: true },
          },
        }
      : {}),
  };
}
export class ContextObserver {
  private sessions = new Map<
    string,
    { system: string; tools: string; messages: string[] }
  >();
  observe(e: {
    sessionID: string;
    system: unknown;
    tools: unknown;
    messages: unknown[];
  }) {
    const system = JSON.stringify(e.system ?? []),
      tools = JSON.stringify(e.tools ?? {}),
      texts = e.messages.map((x) => JSON.stringify(x) ?? "null");
    const current = {
        system: digest(system),
        tools: digest(tools),
        messages: texts.map(digest),
      },
      previous = this.sessions.get(e.sessionID);
    const prefixChanged =
      previous !== undefined &&
      (previous.system !== current.system ||
        previous.tools !== current.tools ||
        previous.messages.some((x, i) => current.messages[i] !== x));
    this.sessions.delete(e.sessionID);
    this.sessions.set(e.sessionID, current);
    if (this.sessions.size > 128)
      this.sessions.delete(this.sessions.keys().next().value!);
    return {
      messageCount: e.messages.length,
      messageChars: texts.reduce((n, x) => n + x.length, 0),
      systemChars: system.length,
      toolSchemaChars: tools.length,
      prefixChanged,
    };
  }
}
export async function installCacheRuntime(ctx: any) {
  const registrations: { dispose(): Promise<void> }[] = [];
  const locationKey = digest(ctx.location.directory).slice(0, 16),
    diagDir = join(homedir(), ".local/share/Determinus/diagnostics"),
    path = join(diagDir, `cache-${locationKey}-${process.pid}.json`);
  const state = {
    version: CACHE_RELEASE,
    generation: getLoadedPluginBundleGeneration(),
    pid: process.pid,
    active: true,
    startedAt: new Date().toISOString(),
    catalogRoutes: 0,
    forwarded: 0,
    responses2xx: 0,
    failures: 0,
    standaloneOperations: 0,
    headerRepairs: 0,
    persistedResults: 0,
    persistenceFailures: 0,
    prefixChanges: 0,
    contexts: 0,
    usageSteps: 0,
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    lastContext: {} as any,
    samples: [] as TransportSample[],
  };
  const recordedSteps = new Set<string>(),
    modelServices = new Map<string, "go" | "zen">(),
    startedSteps = new Map<string, "go" | "zen">();
  const usageByService = {
    go: { steps: 0, cacheReadTokens: 0 },
    zen: { steps: 0, cacheReadTokens: 0 },
  };
  let lastFlush = 0;
  const flush = (force = false) => {
    if (!force && Date.now() - lastFlush < 1000) return;
    try {
      mkdirSync(diagDir, { recursive: true, mode: 0o700 });
      writeFileSync(
        path + ".tmp",
        JSON.stringify(
          { ...state, usageByService, updatedAt: new Date().toISOString() },
          null,
          2,
        ),
        { mode: 0o600 },
      );
      renameSync(path + ".tmp", path);
      lastFlush = Date.now();
    } catch {
      /* local telemetry must not interrupt inference */
    }
  };
  const recordEvent = (input: any) => {
    const e = input?.event ?? input,
      d = e?.data ?? e?.properties ?? e;
    if (!d?.sessionID || !d?.assistantMessageID) return;
    const key = `${d.sessionID}:${d.assistantMessageID}`;
    if (e.type === "session.step.started") {
      const s = modelServices.get(`${d.model?.providerID}/${d.model?.id}`);
      if (s) startedSteps.set(key, s);
      if (startedSteps.size > 512)
        startedSteps.delete(startedSteps.keys().next().value!);
      return;
    }
    if (e.type !== "session.step.ended" || recordedSteps.has(key)) return;
    const values = [
      d.tokens?.input,
      d.tokens?.cache?.read,
      d.tokens?.cache?.write,
    ];
    if (
      !values.every(
        (x) => typeof x === "number" && Number.isFinite(x) && x >= 0,
      )
    )
      return;
    recordedSteps.add(key);
    if (recordedSteps.size > 512)
      recordedSteps.delete(recordedSteps.values().next().value!);
    const s = startedSteps.get(key);
    startedSteps.delete(key);
    if (s) {
      usageByService[s].steps++;
      usageByService[s].cacheReadTokens += values[1];
    }
    state.usageSteps++;
    state.inputTokens += values[0];
    state.cacheReadTokens += values[1];
    state.cacheWriteTokens += values[2];
    flush(true);
  };
  const userAgent =
    `${ctx.app.name}/${ctx.app.version} Determinus/${CACHE_RELEASE}`.replace(
      /[^\x20-\x7e]/g,
      "_",
    );
  const gateway = await createCacheGateway({
    userAgent,
    record: (e) => {
      state.forwarded++;
      if (e.status !== undefined && e.status >= 200 && e.status < 300)
        state.responses2xx++;
      else state.failures++;
      if (e.identitySource === "standalone-operation")
        state.standaloneOperations++;
      state.samples.push(e);
      if (state.samples.length > 64) state.samples.shift();
      flush(true);
    },
  });
  const observer = new ContextObserver();
  const persist = (text: string) => {
    const file = persistResult(text, locationKey);
    state.persistedResults++;
    return file;
  };
  const close = async () => {
    try {
      for (const r of registrations.reverse()) await r.dispose();
    } finally {
      await gateway.close();
      state.active = false;
      flush(true);
    }
  };
  try {
    if (!ctx.catalog?.transform || !ctx.session?.hook)
      throw Error(
        "Determinus requires Beta catalog.transform and session hooks",
      );
    registrations.push(
      await ctx.catalog.transform((catalog: any) => {
        for (const entry of catalog.provider.list()) {
          const p = entry.provider,
            base =
              p.settings?.baseURL ??
              (p.id === "opencode-go"
                ? "https://opencode.ai/zen/go/v1"
                : p.id === "opencode"
                  ? "https://opencode.ai/zen/v1"
                  : undefined);
          if (goZenURL(base) || gateway.recognizes(base))
            catalog.provider.update(p.id, (d: any) => {
              d.settings = { ...d.settings, baseURL: gateway.route(base) };
            });
          for (const model of entry.models.values()) {
            const modelBase = model.settings?.baseURL ?? base;
            if (!goZenURL(modelBase) && !gateway.recognizes(modelBase))
              continue;
            const service = gateway.service(modelBase);
            if (service) modelServices.set(`${p.id}/${model.id}`, service);
            catalog.model.update(p.id, model.id, (d: any) => {
              d.settings = { ...d.settings, baseURL: gateway.route(modelBase) };
              d.capabilities = {
                ...d.capabilities,
                responsesWebsockets: false,
              };
              if (
                typeof d.limit?.context === "number" &&
                d.limit.context > CONTEXT_LIMIT
              )
                d.limit = {
                  ...d.limit,
                  context: CONTEXT_LIMIT,
                  ...(typeof d.limit.input === "number"
                    ? { input: Math.min(d.limit.input, CONTEXT_LIMIT) }
                    : {}),
                  ...(typeof d.limit.output === "number"
                    ? { output: Math.min(d.limit.output, 16384) }
                    : {}),
                };
              for (const v of d.variants ?? []) {
                const b = v.settings?.baseURL;
                if (goZenURL(b) || gateway.recognizes(b))
                  v.settings = { ...v.settings, baseURL: gateway.route(b) };
              }
            });
            state.catalogRoutes++;
          }
        }
        flush();
      }),
    );
    registrations.push(
      await ctx.session.hook("model.request", (e: any) => {
        if (!goZenURL(e.baseURL) && !gateway.recognizes(e.baseURL)) return;
        if (goZenURL(e.baseURL)) e.baseURL = gateway.route(e.baseURL);
        const h = new Headers(e.headers);
        if (h.get("x-opencode-session") !== e.sessionID) state.headerRepairs++;
        h.set("x-opencode-session", e.sessionID);
        h.set("user-agent", userAgent);
        e.headers = Object.fromEntries(h);
      }),
    );
    registrations.push(
      await ctx.session.hook("context", (e: any) => {
        state.lastContext = observer.observe(e);
        if (state.lastContext.prefixChanged) state.prefixChanges++;
        state.contexts++;
        flush();
      }),
    );
    registrations.push(
      await ctx.tool.hook("execute.after", (e: any) => {
        try {
          if (e.status === "completed")
            e.result = containResult(e.tool, e.result, persist);
          else if (
            e.status === "error" &&
            e.error?.message?.length > RESULT_LIMIT
          ) {
            const text = e.error.message,
              file = persist(JSON.stringify({ message: text }));
            e.error.message = `${text.slice(0, 2600)}\n…\n${text.slice(-1200)}\nFull error: ${file}`;
          }
        } catch {
          state.persistenceFailures++;
        }
        flush();
      }),
    );
    flush(true);
    return Object.assign(close, { recordEvent });
  } catch (e) {
    await close();
    throw e;
  }
}
