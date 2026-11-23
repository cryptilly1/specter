import type { CameraViewLike } from "./host";

/**
 * Optional sidecar next to a GLB (for example `/models/cell.config.json`). It tells an app which mesh names the
 * model uses, so hotspots, aliases and camera views line up with a real model instead of the procedural one.
 * Generate a starting file with `pnpm models:audit <file.glb> --init-config`.
 */
export interface ModelConfig {
  hotspots?: { id: string; mesh?: string; position?: [number, number, number]; title: string; body: string; offset?: [number, number, number] }[];
  aliases?: Record<string, string>;
  facts?: Record<string, string>;
  views?: Record<string, CameraViewLike>;
  /** Uniform scale applied to the loaded model. */
  scale?: number;
  /** One-click commands that suit this model's mesh names. */
  chips?: { label: string; text: string }[];
  /** Guided tour for walkthrough apps. Times must strictly increase. */
  tour?: { id: string; label: string; t: number; hold?: number; position: [number, number, number]; target: [number, number, number]; title: string; body: string }[];
}

const isVec3 = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));

/** Fetch and sanity-check a sidecar. Returns null when it is missing or invalid, never throws. */
export async function fetchModelConfig(url: string): Promise<ModelConfig | null> {
  try {
    const r = await fetch(url);
    if (!r.ok || (r.headers.get("content-type") ?? "").includes("text/html")) return null;
    const j = (await r.json()) as ModelConfig;
    if (typeof j !== "object" || j === null) return null;
    const out: ModelConfig = {};
    if (Array.isArray(j.hotspots)) {
      out.hotspots = j.hotspots.filter((h) => h && typeof h.id === "string" && typeof h.title === "string" && typeof h.body === "string" && (typeof h.mesh === "string" || isVec3(h.position)));
    }
    if (j.aliases && typeof j.aliases === "object") out.aliases = Object.fromEntries(Object.entries(j.aliases).filter(([, v]) => typeof v === "string"));
    if (j.facts && typeof j.facts === "object") out.facts = Object.fromEntries(Object.entries(j.facts).filter(([, v]) => typeof v === "string"));
    if (j.views && typeof j.views === "object") {
      out.views = Object.fromEntries(Object.entries(j.views).filter(([, v]) => v && isVec3(v.position) && isVec3(v.target)));
    }
    if (Array.isArray(j.chips)) out.chips = j.chips.filter((c) => c && typeof c.label === "string" && typeof c.text === "string");
    if (Array.isArray(j.tour)) {
      const tour = j.tour.filter((k) => k && typeof k.id === "string" && typeof k.label === "string" && typeof k.title === "string" && typeof k.body === "string" && typeof k.t === "number" && isVec3(k.position) && isVec3(k.target));
      if (tour.length >= 2) out.tour = tour;
    }
    if (typeof j.scale === "number" && j.scale > 0 && Number.isFinite(j.scale)) out.scale = j.scale;
    return out;
  } catch {
    return null;
  }
}
