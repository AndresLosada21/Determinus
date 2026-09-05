import { it, expect } from "vitest";
import {
  containResult,
  ContextObserver,
  installCacheRuntime,
} from "./cache-runtime";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
it("preserves instructions, protected skills and an append-only prefix", () => {
  const o = new ContextObserver(),
    e = {
      sessionID: "one",
      system: [{ text: "stable" }],
      tools: {},
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "A".repeat(4000) + "DO_NOT_DELETE_DATABASE" + "B".repeat(4000),
            },
          ],
        },
      ],
    };
  const before = JSON.stringify(e);
  o.observe(e);
  expect(JSON.stringify(e)).toBe(before);
  e.messages.push({
    role: "assistant",
    content: [{ type: "text", text: "reply" }],
  });
  expect(o.observe(e).prefixChanged).toBe(false);
  const result = { content: [{ type: "text", text: "RULES".repeat(2000) }] };
  expect(
    containResult("skill", result, () => {
      throw Error("must preserve");
    }),
  ).toBe(result);
});
it("persists complete fresh results and preserves essential status fields", () => {
  let saved = "";
  const original = {
    content: [{ type: "text", text: "X".repeat(10000) }],
    structured: { success: false, code: "FAILED", detail: "Y".repeat(10000) },
  };
  const result = containResult("shell", original, (x) => {
    saved = x;
    return "/private/result.json";
  });
  expect(JSON.parse(saved)).toEqual(original);
  expect(JSON.stringify(result).length).toBeLessThan(6000);
  expect(result.structured.success).toBe(false);
  expect(result.structured.code).toBe("FAILED");
  expect(result.content[0].text).toContain("/private/result.json");
  expect(original.content[0].text.length).toBe(10000);
});
it("preserves attachments and original output when persistence fails", () => {
  const image = { type: "image", url: "data:image/png;base64,AA" },
    original = { content: [{ type: "text", text: "x".repeat(10000) }, image] };
  expect(
    containResult("read", original, () => "/tmp/result").content,
  ).toContainEqual(image);
  expect(() =>
    containResult("read", original, () => {
      throw Error("disk full");
    }),
  ).toThrow();
  expect(original.content[0]).toHaveProperty("text", "x".repeat(10000));
});
it("isolates prefix observations by session", () => {
  const o = new ContextObserver(),
    e = {
      sessionID: "a",
      system: [],
      tools: {},
      messages: [{ role: "user", text: "old" }],
    };
  o.observe(e);
  e.messages[0].text = "new";
  expect(o.observe(e).prefixChanged).toBe(true);
  expect(o.observe({ ...e, sessionID: "b" }).prefixChanged).toBe(false);
});
it("routes custom Go models and variants, caps catalog limits, observes native usage and leaves replay intact", async () => {
  const callbacks = new Map<string, Function>();
  const model = {
      id: "muse",
      settings: {},
      limit: { context: 1000000, input: 500000, output: 64000 },
      capabilities: { responsesWebsockets: true },
      variants: [
        { id: "xhigh", settings: { baseURL: "https://opencode.ai/zen/go/v1" } },
      ],
    },
    provider = {
      id: "custom-go",
      settings: { baseURL: "https://opencode.ai/zen/go/v1" },
    },
    other = { id: "other", settings: { baseURL: "https://example.com/v1" } };
  const catalog = {
    provider: {
      list: () => [
        { provider, models: new Map([["muse", model]]) },
        { provider: other, models: new Map() },
      ],
      update: (_id: string, fn: Function) => fn(provider),
    },
    model: { update: (_p: string, _id: string, fn: Function) => fn(model) },
  };
  const directory = mkdtempSync(join(tmpdir(), "det-cache-fixture-")),
    file = join(
      homedir(),
      ".local/share/Determinus/diagnostics",
      `cache-${createHash("sha256").update(directory).digest("hex").slice(0, 16)}-${process.pid}.json`,
    );
  const reg = async (name: string, fn: Function) => {
    callbacks.set(name, fn);
    return { dispose: async () => {} };
  };
  const ctx = {
    app: { name: "OpenCode-test", version: "beta" },
    location: { directory },
    catalog: {
      transform: async (fn: Function) => {
        fn(catalog);
        return { dispose: async () => {} };
      },
    },
    session: { hook: reg },
    tool: { hook: reg },
  };
  const close = await installCacheRuntime(ctx);
  try {
    expect(provider.settings.baseURL).toMatch(/^http:\/\/127\.0\.0\.1:/);
    expect(other.settings.baseURL).toBe("https://example.com/v1");
    expect(model.limit).toEqual({
      context: 96000,
      input: 96000,
      output: 16384,
    });
    expect(model.capabilities.responsesWebsockets).toBe(false);
    expect(model.variants[0].settings.baseURL).toBe(provider.settings.baseURL);
    const req = {
      sessionID: "real-session",
      baseURL: provider.settings.baseURL,
      headers: { "X-OPENCODE-SESSION": "wrong" },
    };
    callbacks.get("model.request")!(req);
    expect(req.headers).toHaveProperty("x-opencode-session", "real-session");
    const context = {
      sessionID: "real-session",
      system: [{ text: "all" }],
      tools: {},
      messages: Array.from({ length: 60 }, () => ({
        role: "user",
        content: [{ type: "text", text: "x".repeat(9000) }],
      })),
    };
    const raw = JSON.stringify(context);
    callbacks.get("context")!(context);
    expect(JSON.stringify(context)).toBe(raw);
    const start = {
        type: "session.step.started",
        data: {
          sessionID: "real-session",
          assistantMessageID: "message1",
          model: { providerID: "custom-go", id: "muse" },
        },
      },
      ended = {
        type: "session.step.ended",
        data: {
          sessionID: "real-session",
          assistantMessageID: "message1",
          tokens: { input: 100, cache: { read: 200, write: 0 } },
        },
      };
    close.recordEvent(start);
    close.recordEvent({ event: ended });
    close.recordEvent(ended);
    close.recordEvent({
      ...ended,
      data: { ...ended.data, assistantMessageID: "unattributed" },
    });
    const data = JSON.parse(readFileSync(file, "utf8"));
    expect(data.usageSteps).toBe(2);
    expect(data.usageByService.go).toEqual({ steps: 1, cacheReadTokens: 200 });
    expect(data.usageByService.zen).toEqual({ steps: 0, cacheReadTokens: 0 });
    expect(JSON.stringify(data)).not.toContain("real-session");
  } finally {
    await close();
    rmSync(file, { force: true });
    rmSync(directory, { recursive: true, force: true });
  }
});
