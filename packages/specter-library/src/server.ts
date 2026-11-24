import { pollGeneration, startGeneration, type GenerateStatus } from "./meshy";
import { availableProviders, searchLibraries, type LibraryEnv } from "./search";
import type { Provider, SearchResult } from "./types";

export interface LibraryRequest {
  method: string;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
  ip?: string;
}

export interface LibraryResponse<T> {
  status: number;
  body: T | { error: string };
}

// small per-instance limiter, same idea as /api/spec
const hits = new Map<string, number[]>();
function limited(ip: string | undefined, max: number): boolean {
  const now = Date.now();
  const k = ip || "anon";
  const arr = (hits.get(k) ?? []).filter((t) => now - t < 60_000);
  if (arr.length >= max) return true;
  arr.push(now);
  hits.set(k, arr);
  if (hits.size > 5000) hits.clear();
  return false;
}
export function resetLibraryLimiter(): void {
  hits.clear();
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const PROVIDERS: Provider[] = ["catalogue", "polyhaven", "polypizza", "smithsonian"];

/** GET /api/assets?q=lantern[&providers=polyhaven,polypizza][&limit=8]  or GET /api/assets (capabilities) */
export async function handleAssetsRequest(req: LibraryRequest, env: LibraryEnv, deps: { fetchImpl?: typeof fetch } = {}): Promise<LibraryResponse<SearchResult | { providers: Provider[]; generate: boolean }>> {
  if (req.method !== "GET") return { status: 405, body: { error: "Use GET" } };
  const q = one(req.query.q).trim();
  if (!q) return { status: 200, body: { providers: availableProviders(env), generate: Boolean(env.MESHY_API_KEY?.trim()) } };
  if (q.length > 80) return { status: 400, body: { error: "Query too long" } };
  if (limited(req.ip, 60)) return { status: 429, body: { error: "Too many searches. Try again in a minute." } };
  const providers = one(req.query.providers)
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Provider => (PROVIDERS as string[]).includes(s));
  const limit = Number(one(req.query.limit)) || 8;
  const result = await searchLibraries(q, env, { limit, providers: providers.length ? providers : undefined, fetchImpl: deps.fetchImpl });
  return { status: 200, body: result };
}

/** POST /api/generate {prompt} starts a job. POST {prompt, job:{id,stage}} polls it. GET reports whether it's enabled. */
export async function handleGenerateRequest(req: LibraryRequest, env: LibraryEnv, deps: { fetchImpl?: typeof fetch } = {}): Promise<LibraryResponse<GenerateStatus | { enabled: boolean }>> {
  const key = env.MESHY_API_KEY?.trim();
  if (req.method === "GET") return { status: 200, body: { enabled: Boolean(key) } };
  if (req.method !== "POST") return { status: 405, body: { error: "Use POST" } };
  if (!key) return { status: 503, body: { error: "Generation is not set up (no MESHY_API_KEY)." } };
  const b = (req.body ?? {}) as { prompt?: unknown; job?: { id?: unknown; stage?: unknown } };
  const prompt = typeof b.prompt === "string" ? b.prompt : "";
  if (!prompt || prompt.length > 300) return { status: 400, body: { error: "Invalid prompt" } };
  try {
    if (b.job && typeof b.job.id === "string" && (b.job.stage === "preview" || b.job.stage === "refine")) {
      if (limited(`${req.ip}:poll`, 120)) return { status: 429, body: { error: "Polling too fast" } };
      return { status: 200, body: await pollGeneration({ id: b.job.id, stage: b.job.stage }, prompt, key, deps) };
    }
    if (limited(`${req.ip}:gen`, 6)) return { status: 429, body: { error: "Too many generations. Try again in a minute." } };
    return { status: 200, body: await startGeneration(prompt, key, deps) };
  } catch {
    return { status: 502, body: { error: "Meshy could not be reached." } };
  }
}
