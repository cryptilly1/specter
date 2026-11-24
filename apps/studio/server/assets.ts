import { handleAssetsRequest } from "specter-library/server";

/** Vercel serverless function: GET /api/assets?q=... searches free model libraries. Keys come from env only. */
export default async function handler(req: any, res: any) {
  const fwd = String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0]?.trim();
  const out = await handleAssetsRequest({ method: req.method, query: req.query ?? {}, ip: fwd || req.socket?.remoteAddress }, process.env as never);
  // search results may be cached briefly by the CDN; capability checks (no q) are not
  res.setHeader("cache-control", req.query?.q ? "public, max-age=300" : "no-store");
  res.status(out.status).json(out.body);
}
