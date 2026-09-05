import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { request as httpsRequest } from "node:https";
import { createHash, randomBytes } from "node:crypto";
export const CACHE_RELEASE = "3.0.4";
const BODY_LIMIT = 32 * 1024 * 1024;
const HOP = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "keep-alive",
  "upgrade",
  "proxy-authorization",
  "proxy-authenticate",
  "te",
  "trailer",
]);
export function goZenURL(value: unknown): URL | undefined {
  if (typeof value !== "string") return;
  try {
    const u = new URL(value);
    if (
      u.protocol === "https:" &&
      u.hostname === "opencode.ai" &&
      (!u.port || u.port === "443") &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      /^\/zen\/(?:go\/)?v1(?:\/|$)/.test(u.pathname)
    )
      return u;
  } catch {
    // Non-URL base: not a routable gateway candidate.
  }
}
const validID = (x: unknown): x is string =>
  typeof x === "string" && /^[\x21-\x7e]{1,256}$/.test(x);
export function sessionIdentity(headers: Headers, body: Buffer) {
  const current = headers.get("x-opencode-session");
  if (validID(current)) return { id: current, source: "session" };
  for (const key of ["x-session-affinity", "x-session-id"]) {
    const value = headers.get(key);
    if (validID(value)) return { id: value, source: "affinity" };
  }
  try {
    const data = JSON.parse(body.toString("utf8"));
    if (validID(data?.prompt_cache_key))
      return { id: data.prompt_cache_key, source: "prompt-cache-key" };
  } catch {
    // Non-JSON body: fall through to standalone-operation identity.
  }
  // Generate.text has no public conversation identity. An identical standalone
  // payload keeps its identity across retries; unrelated payloads do not share it.
  return {
    id: "det-aux-" + createHash("sha256").update(body).digest("hex"),
    source: "standalone-operation",
  };
}
export interface TransportSample {
  service: "go" | "zen";
  identitySource: string;
  sessionHash: string;
  sessionPresent: boolean;
  userAgentPresent: boolean;
  requestBytes: number;
  status?: number;
}
export interface GatewayOptions {
  userAgent: string;
  record: (sample: TransportSample) => void;
  upstreamRequest?: typeof httpsRequest;
}
export async function createCacheGateway(options: GatewayOptions) {
  const routes = new Map<string, URL>(),
    keys = new Map<string, string>();
  const requests = new Set<ReturnType<typeof httpsRequest>>();
  const sample = (x: TransportSample) => {
    try {
      options.record(x);
    } catch {
      /* telemetry cannot interrupt inference */
    }
  };
  const handle = async (
    incoming: IncomingMessage,
    outgoing: ServerResponse,
  ) => {
    if (incoming.headers.origin) {
      outgoing.writeHead(403).end();
      return;
    }
    const match = /^\/([a-f0-9]{48})(\/[^?#]*)?(\?[^#]*)?$/.exec(
      incoming.url ?? "",
    );
    const upstream = match && routes.get(match[1]);
    if (
      !match ||
      !upstream ||
      !["POST", "GET"].includes(incoming.method ?? "")
    ) {
      outgoing.writeHead(404).end();
      return;
    }
    const suffix = match[2] ?? "";
    if (!/^\/(?:responses|chat\/completions|messages|models)$/.test(suffix)) {
      outgoing.writeHead(404).end();
      return;
    }
    const target = new URL(upstream.toString());
    target.pathname = upstream.pathname.replace(/\/$/, "") + suffix;
    target.search = match[3] ?? "";
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of incoming) {
        size += chunk.length;
        if (size > BODY_LIMIT) {
          outgoing.writeHead(413).end("Determinus: request exceeds 32 MiB");
          incoming.resume();
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
    } catch {
      outgoing.destroy();
      return;
    }
    const body = Buffer.concat(chunks);
    const headers = new Headers();
    const connectionHeaders = new Set(
      String(incoming.headers.connection ?? "")
        .toLowerCase()
        .split(",")
        .map((x) => x.trim()),
    );
    for (const [key, value] of Object.entries(incoming.headers))
      if (value !== undefined && !HOP.has(key) && !connectionHeaders.has(key))
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    const identity = sessionIdentity(headers, body);
    headers.set("x-opencode-session", identity.id);
    headers.set("user-agent", options.userAgent);
    const entry: TransportSample = {
      service: upstream.pathname.startsWith("/zen/go/") ? "go" : "zen",
      identitySource: identity.source,
      sessionHash: createHash("sha256")
        .update(identity.id)
        .digest("hex")
        .slice(0, 16),
      sessionPresent: true,
      userAgentPresent: true,
      requestBytes: body.length,
    };
    let completed = false;
    const finish = (status?: number) => {
      if (!completed) {
        completed = true;
        sample({ ...entry, status });
      }
    };
    // Authentication is forwarded only to the allowlisted HTTPS origin. The host
    // owns retries. No body rewriting, redirect following or extra billed calls.
    const request = (options.upstreamRequest ?? httpsRequest)(
      target,
      { method: incoming.method, headers: Object.fromEntries(headers) },
      (response) => {
        const reply: Record<string, string | string[]> = {};
        const responseConnection = new Set(
          String(response.headers.connection ?? "")
            .toLowerCase()
            .split(",")
            .map((x) => x.trim()),
        );
        for (const [key, value] of Object.entries(response.headers))
          if (
            value !== undefined &&
            !HOP.has(key) &&
            !responseConnection.has(key)
          )
            reply[key] = value;
        outgoing.writeHead(response.statusCode ?? 502, reply);
        response.on("error", () => {
          finish(502);
          outgoing.destroy();
        });
        response.on("end", () => finish(response.statusCode));
        response.pipe(outgoing);
      },
    );
    requests.add(request);
    request.on("close", () => requests.delete(request));
    request.setTimeout(600_000, () =>
      request.destroy(new Error("Upstream timeout")),
    );
    request.on("error", () => {
      finish(502);
      if (!outgoing.headersSent)
        outgoing.writeHead(502).end("Determinus: upstream transport failed");
      else outgoing.destroy();
    });
    outgoing.on("close", () => {
      if (!outgoing.writableFinished) request.destroy();
    });
    request.end(body);
  };
  const server = createServer((req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent)
        res.writeHead(502).end("Determinus: transport failed");
      else res.destroy();
    });
  });
  server.on("upgrade", (_req, socket) =>
    socket.end("HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n"),
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  server.unref();
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Gateway did not bind loopback");
  const origin = `http://127.0.0.1:${address.port}`;
  const recognizes = (value: unknown) =>
    typeof value === "string" &&
    value.startsWith(origin + "/") &&
    routes.has(value.slice(origin.length + 1));
  return {
    origin,
    recognizes,
    service(value: unknown): "go" | "zen" | undefined {
      const u =
        goZenURL(value) ??
        (typeof value === "string" && recognizes(value)
          ? routes.get(value.slice(origin.length + 1))
          : undefined);
      return u ? (u.pathname.startsWith("/zen/go/") ? "go" : "zen") : undefined;
    },
    route(value: string) {
      if (recognizes(value)) return value;
      const u = goZenURL(value);
      if (!u || !/^\/zen\/(?:go\/)?v1\/?$/.test(u.pathname))
        throw Error("Unsupported Go/Zen API base URL");
      const canonical = u.toString().replace(/\/$/, "");
      let key = keys.get(canonical);
      if (!key) {
        key = randomBytes(24).toString("hex");
        keys.set(canonical, key);
        routes.set(key, u);
      }
      return `${origin}/${key}`;
    },
    async close() {
      for (const req of requests) req.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
