import { handleGenerateRequest } from "specter-library/server";

/** Vercel serverless function: /api/generate (Meshy). Disabled unless MESHY_API_KEY is set. */
export default async function handler(req: any, res: any) {
  const fwd = String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0]?.trim();
  const out = await handleGenerateRequest({ method: req.method, query: req.query ?? {}, body: req.body, ip: fwd || req.socket?.remoteAddress }, process.env as never);
  res.setHeader("cache-control", "no-store");
  res.status(out.status).json(out.body);
}
