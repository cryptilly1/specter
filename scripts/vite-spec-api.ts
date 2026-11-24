import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadEnv, type Plugin, type ViteDevServer } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const ROUTES = ["/api/spec", "/api/assets", "/api/generate"] as const;
type Route = (typeof ROUTES)[number];

function readBody(req: IncomingMessage, limit = 40_000): Promise<unknown> {
  return new Promise((ok, fail) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > limit) {
        fail(new Error("too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        ok(data ? JSON.parse(data) : null);
      } catch {
        fail(new Error("bad json"));
      }
    });
    req.on("error", fail);
  });
}

const strip = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.trim().replace(/^[`'"]+|[`'"]+$/g, "")]));

/**
 * Serves /api/spec, /api/assets and /api/generate locally with the same code Vercel runs.
 * - `vite dev`: handlers load through Vite's module loader (TypeScript, workspace packages).
 * - `vite preview`: the bundled api/*.js functions run, which also checks the files that get deployed.
 * Keys come from .env.local at the repo root or the app folder.
 */
export function specterApiPlugin(): Plugin {
  let env: Record<string, string> = {};

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify(body));
  };

  const dev = (server: ViteDevServer) => {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const route = url.pathname as Route;
      if (!ROUTES.includes(route)) return next();
      try {
        const body = req.method === "POST" ? await readBody(req) : null;
        const query = Object.fromEntries(url.searchParams.entries());
        const ip = req.socket.remoteAddress;
        let out: { status: number; body: unknown };
        if (route === "/api/spec") {
          const m = await server.ssrLoadModule(resolve(here, "../packages/specter-voice/src/server/index.ts"));
          out = await m.handleSpecRequest({ method: req.method ?? "GET", body, ip }, env);
        } else {
          const m = await server.ssrLoadModule(resolve(here, "../packages/specter-library/src/server.ts"));
          out = route === "/api/assets" ? await m.handleAssetsRequest({ method: req.method ?? "GET", query, ip }, env) : await m.handleGenerateRequest({ method: req.method ?? "GET", query, body, ip }, env);
        }
        send(res, out.status, out.body);
      } catch {
        send(res, 400, { error: "Invalid request" });
      }
    });
  };

  const preview = (server: { middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) => {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const route = url.pathname as Route;
      if (!ROUTES.includes(route)) return next();
      const file = join(process.cwd(), "api", `${route.slice(5)}.js`);
      if (!existsSync(file)) return send(res, 404, { error: "Not found" });
      try {
        Object.assign(process.env, env);
        const mod = await import(pathToFileURL(file).href);
        const body = req.method === "POST" ? await readBody(req) : undefined;
        const vreq = { method: req.method, headers: req.headers, query: Object.fromEntries(url.searchParams.entries()), body, socket: req.socket };
        const vres = {
          setHeader: (k: string, v: string) => res.setHeader(k, v),
          status(code: number) {
            res.statusCode = code;
            return this;
          },
          json(b: unknown) {
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(b));
          },
        };
        await mod.default(vreq, vres);
      } catch {
        send(res, 500, { error: "Function failed" });
      }
    });
  };

  return {
    name: "specter-api",
    config(_c, { mode }) {
      env = strip({ ...loadEnv(mode, resolve(process.cwd(), "../.."), ""), ...loadEnv(mode, process.cwd(), "") });
    },
    configureServer: dev,
    configurePreviewServer: preview,
  };
}
