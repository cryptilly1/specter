import { isAllowedAssetUrl, LICENSES, type AssetCandidate } from "./types";

export interface ProviderContext {
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
  limit: number;
}

/** Categories we never return, whatever the query. */
const BLOCKED_WORDS = ["weapon", "firearm", "gun", "rifle", "pistol", "knife", "sword", "gore", "nsfw", "nude", "blood"];

export function isBlocked(text: string): boolean {
  const t = text.toLowerCase();
  return BLOCKED_WORDS.some((w) => t.includes(w));
}

function words(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !["a", "an", "the", "of", "some", "model", "3d"].includes(w))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

async function getJson(url: string, c: ProviderContext, headers: Record<string, string> = {}): Promise<any> {
  const res = await c.fetchImpl(url, { headers: { accept: "application/json", ...headers }, signal: c.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------------- Poly Haven (no key) ----------------

interface PolyHavenAsset {
  name: string;
  categories: string[];
  tags: string[];
  authors?: Record<string, string>;
  polycount?: number;
}

let polyHavenIndex: { at: number; data: Record<string, PolyHavenAsset> } | null = null;
const POLYHAVEN_TTL = 60 * 60 * 1000;

export function resetPolyHavenCache(): void {
  polyHavenIndex = null;
}

function scorePolyHaven(id: string, a: PolyHavenAsset, q: string[]): number {
  const name = a.name.toLowerCase();
  const tags = a.tags.map((t) => t.toLowerCase());
  const cats = a.categories.map((t) => t.toLowerCase());
  let s = 0;
  for (const w of q) {
    if (name.split(/\s+/).includes(w) || id.split("_").includes(w)) s += 3;
    else if (name.includes(w)) s += 2;
    if (tags.includes(w)) s += 2;
    if (cats.some((c) => c.includes(w))) s += 1;
  }
  return s;
}

/**
 * Poly Haven: free API, no key, CC0 assets. Their API terms ask apps using the live API to show a
 * "Powered by Poly Haven" credit, which is returned as platformCredit.
 */
export async function searchPolyHaven(query: string, c: ProviderContext): Promise<AssetCandidate[]> {
  const q = words(query);
  if (!q.length) return [];
  if (!polyHavenIndex || Date.now() - polyHavenIndex.at > POLYHAVEN_TTL) {
    polyHavenIndex = { at: Date.now(), data: await getJson("https://api.polyhaven.com/assets?t=models", c) };
  }
  const ranked = Object.entries(polyHavenIndex.data)
    .filter(([id, a]) => !isBlocked(`${id} ${a.name} ${a.categories.join(" ")} ${a.tags.join(" ")}`))
    .map(([id, a]) => ({ id, a, s: scorePolyHaven(id, a, q) }))
    .filter((r) => r.s >= 3)
    .sort((x, y) => y.s - x.s)
    .slice(0, c.limit);

  const out: AssetCandidate[] = [];
  await Promise.all(
    ranked.map(async ({ id, a }) => {
      try {
        const files = await getJson(`https://api.polyhaven.com/files/${encodeURIComponent(id)}`, c);
        const g = files?.gltf?.["1k"]?.gltf;
        if (!g?.url || !isAllowedAssetUrl(g.url)) return;
        const urlMap: Record<string, string> = {};
        for (const [rel, f] of Object.entries((g.include ?? {}) as Record<string, { url: string }>)) {
          if (isAllowedAssetUrl(f.url)) urlMap[rel] = f.url;
        }
        const author = Object.keys(a.authors ?? {}).join(", ");
        out.push({
          provider: "polyhaven",
          assetId: id,
          title: a.name,
          url: g.url,
          urlMap,
          thumbnail: `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256&height=256`,
          license: LICENSES.cc0,
          credit: `${a.name}${author ? ` by ${author}` : ""} (Poly Haven, CC0)`,
          sourceUrl: `https://polyhaven.com/a/${id}`,
          platformCredit: { text: "Powered by Poly Haven", url: "https://polyhaven.com" },
          triangles: a.polycount,
          tags: a.tags,
        });
      } catch {
        /* skip this asset */
      }
    }),
  );
  const order = new Map(ranked.map((r, i) => [r.id, i]));
  return out.sort((x, y) => (order.get(x.assetId) ?? 0) - (order.get(y.assetId) ?? 0));
}

// ---------------- Poly Pizza (free key) ----------------

/**
 * Poly Pizza: free key, CC0 and CC-BY low-poly models. Their API terms require attribution for every model and a
 * visible mention that models come from Poly Pizza, with a link. Models are loaded straight from their CDN; we never
 * re-host or mirror the catalogue.
 */
export async function searchPolyPizza(query: string, key: string, c: ProviderContext): Promise<AssetCandidate[]> {
  const q = words(query).join(" ");
  if (!q) return [];
  const data = await getJson(`https://api.poly.pizza/v1/search/${encodeURIComponent(q)}?limit=${Math.min(24, c.limit * 2)}&format=glb`, c, { "X-Auth-Token": key });
  const results = Array.isArray(data?.results) ? data.results : [];
  const out: AssetCandidate[] = [];
  for (const r of results) {
    const lic = String(r.Licence ?? r.License ?? "");
    const license = /cc0|public domain/i.test(lic) ? LICENSES.cc0 : /cc[- ]?by(?![- ]?(nc|nd|sa))/i.test(lic) ? LICENSES.ccby : null;
    if (!license) continue; // skip anything that is not CC0 or plain CC-BY
    const url = String(r.Download ?? "");
    if (!isAllowedAssetUrl(url)) continue;
    const title = String(r.Title ?? "Model").slice(0, 80);
    if (isBlocked(`${title} ${(r.Tags ?? []).join(" ")}`)) continue;
    const user = String(r.Creator?.Username ?? "unknown");
    out.push({
      provider: "polypizza",
      assetId: String(r.ID),
      title,
      url,
      thumbnail: typeof r.Thumbnail === "string" ? r.Thumbnail : undefined,
      license,
      credit: `"${title}" by ${user} (poly.pizza) ${license.label}`,
      sourceUrl: `https://poly.pizza/m/${encodeURIComponent(String(r.ID))}`,
      platformCredit: { text: "Models provided by Poly Pizza", url: "https://poly.pizza" },
      triangles: typeof r.TriangleCount === "number" ? r.TriangleCount : undefined,
      tags: Array.isArray(r.Tags) ? r.Tags.slice(0, 12) : undefined,
    });
    if (out.length >= c.limit) break;
  }
  return out;
}

// ---------------- Smithsonian Open Access (free api.data.gov key) ----------------

const SI_QUALITY_ORDER = ["Medium", "Low", "High", "AR", "Low_resolution", "Thumb"];

/**
 * Smithsonian: the 3D file API (no key) finds web-sized .glb files for a query. Each 3D package is then checked
 * against the Open Access API (key required), and only packages marked CC0 are returned. Some scans are
 * non-commercial only; those are skipped.
 */
export async function searchSmithsonian(query: string, key: string, c: ProviderContext): Promise<AssetCandidate[]> {
  const q = words(query).join(" ");
  if (!q) return [];
  const files = await getJson(`https://3d-api.si.edu/api/v1.0/content/file/search?q=${encodeURIComponent(q)}&file_type=glb&rows=100`, c);
  const byPackage = new Map<string, { title: string; glbs: any[] }>();
  for (const r of files?.rows ?? []) {
    const pkg = String(r?.content?.model_url ?? "");
    if (!/^3d_package:[0-9a-f-]{36}$/i.test(pkg) || r?.content?.usage !== "Web3D") continue;
    if (!isAllowedAssetUrl(String(r?.content?.uri ?? ""))) continue;
    const entry = byPackage.get(pkg) ?? { title: (String(r.title ?? "").trim() || "Smithsonian object").slice(0, 80), glbs: [] };
    entry.glbs.push(r.content);
    byPackage.set(pkg, entry);
  }
  // the 3D file search also matches long descriptions, so require a query word in the title
  const qWords = words(query);
  const relevant = (title: string) => {
    const t = ` ${title.toLowerCase().replace(/[^a-z0-9 ]+/g, " ")} `;
    return qWords.some((w) => t.includes(` ${w}`));
  };
  const packages = [...byPackage.entries()].filter(([, e]) => !isBlocked(e.title) && relevant(e.title)).slice(0, c.limit + 2);
  const out: (AssetCandidate | null)[] = await Promise.all(
    packages.map(async ([pkg, e]) => {
      try {
        const oa = await getJson(`https://api.si.edu/openaccess/api/v1.0/search?q=${encodeURIComponent(`"${pkg}"`)}&rows=3&api_key=${encodeURIComponent(key)}`, c);
        const row = (oa?.response?.rows ?? []).find((r: any) => JSON.stringify(r?.content?.descriptiveNonRepeating?.online_media ?? {}).includes(pkg));
        const media = (row?.content?.descriptiveNonRepeating?.online_media?.media ?? []).find((m: any) => m?.id === pkg);
        if (!media || String(media?.usage?.access ?? "").toUpperCase() !== "CC0") return null;
        e.glbs.sort((a, b) => SI_QUALITY_ORDER.indexOf(a.quality) - SI_QUALITY_ORDER.indexOf(b.quality));
        const best = e.glbs[0];
        const unit = String(row?.unitCode ?? "Smithsonian");
        return {
          provider: "smithsonian",
          assetId: pkg,
          title: e.title,
          url: best.uri,
          thumbnail: typeof media.thumbnail === "string" ? media.thumbnail : undefined,
          license: LICENSES.cc0,
          credit: `${e.title}, Smithsonian Institution (${unit}), CC0`,
          sourceUrl: String(row?.content?.descriptiveNonRepeating?.record_link ?? "https://3d.si.edu"),
          platformCredit: { text: "Smithsonian Open Access", url: "https://www.si.edu/openaccess" },
        } as AssetCandidate;
      } catch {
        return null;
      }
    }),
  );
  return out.filter((x): x is AssetCandidate => x !== null).slice(0, c.limit);
}
