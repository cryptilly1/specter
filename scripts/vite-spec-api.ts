import { loadEnv, type Plugin } from "vite";
import type { IncomingMessage } from "node:http";
import { handleSpecRequest } from "../packages/specter-voice/src/server/index";

function readBody(req: IncomingMessage, limit = 30_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > limit) {
        reject(new Error("too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : null);
      } catch {
        reject(new Error("bad json"));
      }
    });
    req.on("error", reject);
  });
}

/** Serves POST /api/spec in `vite dev` and `vite preview` using the same handler as the Vercel function. */
export function specterApiPlugin(): Plugin {
  let env: Record<string, string> = {};
  const mount = (server: { middlewares: { use: (fn: (req: IncomingMessage, res: any, next: () => void) => void) => void } }) => {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url || !req.url.startsWith("/api/spec")) return next();
      res.setHeader("content-type", "application/json");
      try {
        const body = req.method === "POST" ? await readBody(req) : null;
        const out = await handleSpecRequest({ method: req.method ?? "GET", body, ip: req.socket.remoteAddress }, env as never);
        res.statusCode = out.status;
        res.end(JSON.stringify(out.body));
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Invalid request" }));
      }
    });
  };
  return {
    name: "specter-spec-api",
    config(_c, { mode }) {
      env = { ...loadEnv(mode, process.cwd() + "/../..", ""), ...loadEnv(mode, process.cwd(), "") };
    },
    configureServer: mount,
    configurePreviewServer: mount,
  };
}
