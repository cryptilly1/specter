import { searchCatalogue } from "./catalogue";
import { isBlocked, searchPolyHaven, searchPolyPizza, searchSmithsonian, type ProviderContext } from "./providers";
import type { AssetCandidate, Provider, SearchResult } from "./types";

export interface LibraryEnv {
  POLY_PIZZA_API_KEY?: string;
  SMITHSONIAN_API_KEY?: string;
  MESHY_API_KEY?: string;
}

export interface SearchOptions {
  limit?: number;
  providers?: Provider[];
  fetchImpl?: typeof fetch;
  /** Per-provider timeout. Default 6 s. */
  timeoutMs?: number;
}

const cache = new Map<string, { at: number; result: SearchResult }>();
const CACHE_TTL = 10 * 60 * 1000;

export function clearSearchCache(): void {
  cache.clear();
}

/** Read a key, tolerating stray quotes or backticks pasted around it. */
function key(k?: string): string | undefined {
  const v = (k ?? "").trim().replace(/^[`'"]+|[`'"]+$/g, "");
  return v ? v : undefined;
}

/** Which libraries are usable with the current keys (for the UI). */
export function availableProviders(env: LibraryEnv): Provider[] {
  const p: Provider[] = ["catalogue", "polyhaven"];
  if (key(env.POLY_PIZZA_API_KEY)) p.push("polypizza");
  if (key(env.SMITHSONIAN_API_KEY)) p.push("smithsonian");
  return p;
}

async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fn(ctl.signal);
  } finally {
    clearTimeout(t);
  }
}

/**
 * Search every available library in parallel. One slow or failing library never blocks the others.
 * Results are ordered: catalogue, then Poly Pizza (low-poly, best for scenes), Poly Haven, Smithsonian.
 * Search results are cached for 10 minutes per server instance only; models are never re-hosted.
 */
export async function searchLibraries(query: string, env: LibraryEnv, opts: SearchOptions = {}): Promise<SearchResult> {
  const q = query.trim().slice(0, 80);
  const notes: string[] = [];
  if (!q) return { query: q, candidates: [], notes: ["Empty query"] };
  if (isBlocked(q)) return { query: q, candidates: [], notes: ["That kind of object is not available"] };

  const limit = Math.max(1, Math.min(12, opts.limit ?? 8));
  const enabled = (opts.providers ?? availableProviders(env)).filter((p) => availableProviders(env).includes(p));
  const cacheKey = `${q.toLowerCase()}|${limit}|${enabled.join(",")}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.result;

  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 6000;
  const per = Math.max(2, Math.ceil(limit / 2));

  const run = async (p: Provider): Promise<AssetCandidate[]> => {
    try {
      return await withTimeout(timeoutMs, (signal) => {
        const c: ProviderContext = { fetchImpl, signal, limit: per };
        if (p === "catalogue") return Promise.resolve(searchCatalogue(q));
        if (p === "polyhaven") return searchPolyHaven(q, c);
        if (p === "polypizza") return searchPolyPizza(q, key(env.POLY_PIZZA_API_KEY)!, c);
        if (p === "smithsonian") return searchSmithsonian(q, key(env.SMITHSONIAN_API_KEY)!, c);
        return Promise.resolve([]);
      });
    } catch (e) {
      notes.push(`${p}: ${e instanceof Error && e.name === "AbortError" ? "timed out" : "unavailable"}`);
      return [];
    }
  };

  const order: Provider[] = ["catalogue", "polypizza", "polyhaven", "smithsonian"];
  const lists = await Promise.all(order.filter((p) => enabled.includes(p)).map(run));
  const seen = new Set<string>();
  const candidates: AssetCandidate[] = [];
  for (const list of lists) {
    for (const c of list) {
      const id = `${c.provider}:${c.assetId}`;
      if (seen.has(id)) continue;
      seen.add(id);
      candidates.push(c);
    }
  }
  const result: SearchResult = { query: q, candidates: candidates.slice(0, limit), notes };
  if (candidates.length) cache.set(cacheKey, { at: Date.now(), result });
  if (cache.size > 500) cache.clear();
  return result;
}
