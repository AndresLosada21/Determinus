import { it, expect } from "vitest";
import { createServer, request as httpRequest } from "node:http";
import {
  createCacheGateway,
  goZenURL,
  sessionIdentity,
} from "./cache-transport";
it("allows only official Go and Zen inference origins", () => {
  for (const url of [
    "http://opencode.ai/zen/v1",
    "https://opencode.ai.evil/zen/v1",
    "https://evil.test/zen/v1",
    "https://user:pass@opencode.ai/zen/v1",
    "https://opencode.ai:444/zen/v1",
    "https://opencode.ai/console",
    "https://opencode.ai/zen/v1?key=x",
  ])
    expect(goZenURL(url)).toBeUndefined();
  expect(goZenURL("https://opencode.ai/zen/go/v1")).toBeDefined();
  expect(goZenURL("https://opencode.ai/zen/v1")).toBeDefined();
});
it("keeps real session identity and stable standalone retry identity", () => {
  expect(
    sessionIdentity(
      new Headers({ "x-opencode-session": "thread", "x-session-id": "other" }),
      Buffer.from("{}"),
    ).id,
  ).toBe("thread");
  expect(
    sessionIdentity(
      new Headers(),
      Buffer.from('{"prompt_cache_key":"lineage"}'),
    ).id,
  ).toBe("lineage");
  const a = sessionIdentity(new Headers(), Buffer.from('{"prompt":"one"}'));
  expect(a).toEqual(
    sessionIdentity(new Headers(), Buffer.from('{"prompt":"one"}')),
  );
  expect(a.id).not.toBe(
    sessionIdentity(new Headers(), Buffer.from('{"prompt":"two"}')).id,
  );
});
it("forwards bytes, headers, SSE and 429 for Go/Zen on all three APIs and auxiliary requests", async () => {
  const seen: any[] = [],
    samples: any[] = [],
    targets: string[] = [];
  const backend = createServer(async (req, res) => {
    let body = "";
    for await (const x of req) body += x;
    seen.push({ path: req.url, headers: req.headers, body });
    if (body.includes('"error":true')) {
      res.writeHead(429, { "retry-after": "2" }).end('{"error":"rate"}');
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write('data: {"delta":"olá"}\n\n');
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const address = backend.address();
  if (!address || typeof address === "string") throw Error("bind");
  const gateway = await createCacheGateway({
    userAgent: "OpenCode-test/beta Determinus/3.0.4",
    record: (x) => samples.push(x),
    upstreamRequest: ((url: URL, opts: any, cb: any) => {
      targets.push(url.toString());
      return httpRequest(
        `http://127.0.0.1:${address.port}${url.pathname}${url.search}`,
        opts,
        cb,
      );
    }) as any,
  });
  try {
    for (const base of [
      "https://opencode.ai/zen/go/v1",
      "https://opencode.ai/zen/v1",
    ]) {
      const route = gateway.route(base);
      expect(gateway.route(route)).toBe(route);
      for (const api of ["/responses", "/chat/completions", "/messages"]) {
        const body =
          '{ "model":"test", "messages":[{"role":"user","content":"preserve bytes"}] }';
        const r = await fetch(route + api, {
          method: "POST",
          headers: {
            authorization: "Bearer fixture-not-a-key",
            "content-type": "application/json",
            "x-opencode-session": "session-1",
          },
          body,
        });
        expect(r.headers.get("content-type")).toBe("text/event-stream");
        expect(await r.text()).toBe(
          'data: {"delta":"olá"}\n\ndata: [DONE]\n\n',
        );
        expect(seen.at(-1).body).toBe(body);
        expect(seen.at(-1).headers["x-opencode-session"]).toBe("session-1");
        expect(seen.at(-1).headers.authorization).toBe(
          "Bearer fixture-not-a-key",
        );
        expect(seen.at(-1).headers["user-agent"]).toBe(
          "OpenCode-test/beta Determinus/3.0.4",
        );
      }
    }
    const route = gateway.route("https://opencode.ai/zen/go/v1");
    for (let i = 0; i < 2; i++)
      await (
        await fetch(route + "/responses", {
          method: "POST",
          body: '{"prompt":"aux"}',
        })
      ).text();
    expect(seen.at(-1).headers["x-opencode-session"]).toBe(
      seen.at(-2).headers["x-opencode-session"],
    );
    const failed = await fetch(route + "/responses", {
      method: "POST",
      body: '{"error":true}',
    });
    expect(failed.status).toBe(429);
    expect(failed.headers.get("retry-after")).toBe("2");
    expect(await failed.text()).toBe('{"error":"rate"}');
    const count = seen.length;
    expect(
      (await fetch(route + "/other", { method: "POST", body: "{}" })).status,
    ).toBe(404);
    expect(
      (
        await fetch(route + "/responses", {
          method: "POST",
          headers: { origin: "https://evil.test" },
          body: "{}",
        })
      ).status,
    ).toBe(403);
    expect(seen.length).toBe(count);
    expect(samples.length).toBe(9);
    expect(JSON.stringify(samples)).not.toContain("fixture-not-a-key");
    expect(JSON.stringify(samples)).not.toContain("preserve bytes");
    expect(targets.every((x) => x.startsWith("https://opencode.ai/zen/"))).toBe(
      true,
    );
  } finally {
    await gateway.close();
    backend.closeAllConnections();
    await new Promise<void>((resolve) => backend.close(() => resolve()));
  }
});
it("cancels upstream when the client aborts a stream", async () => {
  let markClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    markClosed = resolve;
  });
  let calls = 0;
  const backend = createServer(async (req, res) => {
    for await (const _ of req) {
    }
    calls++;
    res.on("close", markClosed);
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write('data: {"delta":"first"}\n\n');
  });
  await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const a = backend.address();
  if (!a || typeof a === "string") throw Error("bind");
  const g = await createCacheGateway({
    userAgent: "OpenCode/test",
    record: () => {},
    upstreamRequest: ((_u: any, o: any, cb: any) =>
      httpRequest(`http://127.0.0.1:${a.port}/responses`, o, cb)) as any,
  });
  try {
    const abort = new AbortController();
    const r = await fetch(
      g.route("https://opencode.ai/zen/go/v1") + "/responses",
      { method: "POST", body: "{}", signal: abort.signal },
    );
    await r.body!.getReader().read();
    abort.abort();
    await closed;
    expect(calls).toBe(1);
  } finally {
    await g.close();
    backend.closeAllConnections();
    await new Promise<void>((resolve) => backend.close(() => resolve()));
  }
});
