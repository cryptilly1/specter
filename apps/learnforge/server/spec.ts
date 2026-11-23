import { handleSpecRequest } from "specter-voice/server";

/** Vercel serverless function: POST /api/spec. Keys come from environment variables only. */
export default async function handler(req: any, res: any) {
  const fwd = String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0]?.trim();
  const out = await handleSpecRequest({ method: req.method, body: req.body, ip: fwd || req.socket?.remoteAddress }, process.env as never);
  res.setHeader("cache-control", "no-store");
  res.status(out.status).json(out.body);
}
