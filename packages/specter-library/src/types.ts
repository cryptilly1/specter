/** Where a 3D object came from. Every object Specter adds carries one of these, so credits are never lost. */
export type Provider = "catalogue" | "polyhaven" | "polypizza" | "smithsonian" | "meshy";

export interface AssetLicense {
  /** SPDX-style id: "CC0-1.0", "CC-BY-4.0", or "Generated" for AI output. */
  id: string;
  /** Short human label, e.g. "CC0" or "CC BY 4.0". */
  label: string;
  /** True when a visible credit is legally or contractually required. */
  attributionRequired: boolean;
}

export interface AssetCandidate {
  provider: Provider;
  /** Provider's own id. Stable, safe to store. */
  assetId: string;
  title: string;
  /** Direct https URL of a .glb or .gltf file on an allowlisted host. */
  url: string;
  /** For multi-file glTF: relative file name -> absolute URL (Poly Haven). */
  urlMap?: Record<string, string>;
  thumbnail?: string;
  license: AssetLicense;
  /** Ready-to-display credit line. */
  credit: string;
  /** Page a person can open to see the original. */
  sourceUrl: string;
  /** Platform credit required by the provider's API terms, e.g. "Models provided by Poly Pizza". */
  platformCredit?: { text: string; url: string };
  triangles?: number;
  tags?: string[];
}

export interface SearchResult {
  query: string;
  candidates: AssetCandidate[];
  /** Providers that failed or were skipped, with a short reason. Never contains secrets. */
  notes: string[];
}

export const LICENSES = {
  cc0: { id: "CC0-1.0", label: "CC0", attributionRequired: false } as AssetLicense,
  ccby: { id: "CC-BY-4.0", label: "CC BY 4.0", attributionRequired: true } as AssetLicense,
  generated: { id: "Generated", label: "AI-generated (Meshy)", attributionRequired: false } as AssetLicense,
};

/**
 * Hosts an asset URL may point at. Share links and AI answers can only load models from these, so a crafted link
 * cannot make a viewer fetch arbitrary URLs.
 */
export const ALLOWED_ASSET_HOSTS = [
  "dl.polyhaven.org",
  "static.poly.pizza",
  "3d-api.si.edu",
  "raw.githubusercontent.com",
  "assets.meshy.ai",
];

export function isAllowedAssetUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    // Meshy serves results from signed URLs on its own subdomains
    return ALLOWED_ASSET_HOSTS.includes(u.hostname) || u.hostname.endsWith(".meshy.ai");
  } catch {
    return false;
  }
}
