import type { AssetCandidate } from "specter-library";
import type { Choice, ResolveResult, Spec } from "specter-voice";
import type { SpecterScene } from "../scene";
import { getRecipe, RECIPES } from "./recipes";

type Op = Spec["ops"][number];

export interface GenerationJob {
  id: string;
  stage: "preview" | "refine";
}

export interface StudioResolverOptions {
  scene: SpecterScene;
  /** Base URL for /api/assets and /api/generate. Default "" (same origin). */
  apiBase?: string;
  fetchImpl?: typeof fetch;
  /** Called when a generation job starts. The app polls it and later submits the finished model. */
  onGenerate?: (job: GenerationJob, op: Op & { source: { type: "generate"; prompt: string } }) => void;
  /** Search timeout. Default 9 s. */
  timeoutMs?: number;
}

/** Typical real-world heights in metres, so a found "tree" isn't the size of a cup. */
const TYPICAL_HEIGHT: [RegExp, number][] = [
  [/\b(skyscraper|tower|lighthouse)\b/, 20],
  [/\b(castle|church|temple)\b/, 8],
  [/\b(house|building|barn|cottage|shed)\b/, 4],
  [/\b(tree|pine|oak|palm)\b/, 4],
  [/\b(rocket|shuttle|spaceship|ship|boat)\b/, 5],
  [/\b(dinosaur|t-?rex|triceratops|elephant|giraffe|whale)\b/, 3],
  [/\b(horse|cow|camel|bear)\b/, 1.8],
  [/\b(person|man|woman|human|knight|robot|statue|astronaut)\b/, 1.75],
  [/\b(car|truck|bus|van|tractor)\b/, 1.6],
  [/\b(door|wardrobe|fridge|bookshelf|bookcase)\b/, 2],
  [/\b(lamp ?post|street ?lamp|street ?light)\b/, 3.5],
  [/\b(dog|wolf|deer|goat|sheep|pig)\b/, 0.8],
  [/\b(chair|armchair|bench|sofa|couch)\b/, 0.95],
  [/\b(table|desk)\b/, 0.78],
  [/\b(cat|fox|bush|plant|crate|barrel|chest)\b/, 0.6],
  [/\b(lantern|vase|pot|bucket|helmet|skull|bird|bottle|mug|cup|book|candle|apple|fruit|avocado)\b/, 0.3],
];

export function typicalHeight(query: string): number {
  const q = query.toLowerCase();
  for (const [re, h] of TYPICAL_HEIGHT) if (re.test(q)) return h;
  return 1;
}

function assetOp(base: Op, c: AssetCandidate): Op {
  const { source: _s, ...rest } = base as Op & { source: unknown };
  return {
    ...rest,
    source: {
      type: "asset",
      provider: c.provider,
      assetId: c.assetId,
      title: c.title,
      url: c.url,
      ...(c.urlMap && Object.keys(c.urlMap).length ? { urlMap: c.urlMap } : {}),
      license: c.license,
      credit: c.credit,
      sourceUrl: c.sourceUrl,
      ...(c.platformCredit ? { platformCredit: c.platformCredit } : {}),
      ...(c.thumbnail ? { thumbnail: c.thumbnail } : {}),
    },
  };
}

/**
 * Turns Studio requests into ops that can be applied: recipes become shapes, searches become licensed library models,
 * and generation becomes a background job. The controller validates the result again before showing it.
 */
export function createStudioResolver(opts: StudioResolverOptions) {
  const base = opts.apiBase ?? "";
  const f = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const cache = new Map<string, AssetCandidate[]>();

  async function search(query: string): Promise<{ candidates: AssetCandidate[]; notes: string[] }> {
    const key = query.toLowerCase();
    const hit = cache.get(key);
    if (hit) return { candidates: hit, notes: [] };
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 9000);
    try {
      const res = await f(`${base}/api/assets?q=${encodeURIComponent(query)}&limit=8`, { signal: ctl.signal });
      if (!res.ok) return { candidates: [], notes: [`Model search failed (${res.status}).`] };
      const data = (await res.json()) as { candidates?: AssetCandidate[]; notes?: string[] };
      const candidates = Array.isArray(data.candidates) ? data.candidates : [];
      if (candidates.length) cache.set(key, candidates);
      return { candidates, notes: data.notes ?? [] };
    } catch {
      return { candidates: [], notes: ["Model search is unreachable right now."] };
    } finally {
      clearTimeout(t);
    }
  }

  function expandRecipe(op: Op & { source: { recipe: string } }): Op[] | null {
    const r = getRecipe(op.source.recipe);
    if (!r) return null;
    const ops = r.build(String(op.id), { ...(op.position ? { position: op.position as [number, number, number] } : {}), ...(op.on ? { on: String(op.on) } : {}) });
    // keep hotspot ids unique when the same recipe is built twice
    const existing = new Set(opts.scene.hotspots.list().map((h) => h.id));
    return ops.map((o) => {
      if (o.op === "addHotspot" && typeof o.id === "string" && existing.has(o.id)) {
        let k = 2;
        while (existing.has(`${o.id}-${k}`)) k++;
        existing.add(`${o.id}-${k}`);
        return { ...o, id: `${o.id}-${k}` };
      }
      return o;
    });
  }

  async function resolve(spec: Spec, text = ""): Promise<ResolveResult> {
    const out: Op[] = [];
    const choices: Choice[] = [];
    const notices: string[] = [];
    const errors: string[] = [];

    for (const op of spec.ops) {
      const src = (op as { source?: { type?: string } }).source;
      if (op.op !== "addObject" || !src) {
        out.push(op);
        continue;
      }
      if (src.type === "recipe") {
        const ops = expandRecipe(op as Op & { source: { recipe: string } });
        if (ops) out.push(...ops);
        else errors.push(`There is no "${(src as { recipe: string }).recipe}" recipe. Recipes: ${RECIPES.map((r) => r.title).join(", ")}.`);
        continue;
      }
      if (src.type === "search") {
        const query = (src as { query: string }).query;
        // a search that names a recipe topic gets the recipe ("show me an eclipse")
        const recipe = RECIPES.find((r) => r.keywords.some((k) => k === query.toLowerCase()));
        if (recipe) {
          out.push(...(expandRecipe({ ...op, source: { type: "recipe", recipe: recipe.id } } as Op & { source: { recipe: string } }) ?? []));
          continue;
        }
        const { candidates, notes } = await search(query);
        if (!candidates.length) {
          errors.push(`I couldn't find a free model for "${query}". Try a simpler word${notes.length ? ` (${notes[0]})` : ""}, or build it from shapes.`);
          continue;
        }
        const words = `${query} ${String(op.id).replace(/_/g, " ")} ${text}`.toLowerCase();
        const sizeFactor = /\b(tiny|miniature)\b/.test(words) ? 0.35 : /\b(small|little|mini)\b/.test(words) ? 0.5 : /\b(huge|giant|massive|enormous)\b/.test(words) ? 2.5 : /\b(big|large|tall)\b/.test(words) ? 1.6 : 1;
        const height = typeof op.height === "number" ? op.height : Math.round(typicalHeight(query) * sizeFactor * 100) / 100;
        const withHeight = { ...op, height };
        const index = out.length;
        out.push(assetOp(withHeight, candidates[0]!));
        if (candidates.length > 1) {
          choices.push({
            opIndex: index,
            prompt: `Models for “${query}”`,
            selected: 0,
            options: candidates.map((c) => ({ label: c.title, detail: `${providerName(c.provider)} · ${c.license.label}`, thumbnail: c.thumbnail, op: assetOp(withHeight, c) })),
          });
        }
        continue;
      }
      if (src.type === "generate") {
        const prompt = (src as { prompt: string }).prompt;
        try {
          const res = await f(`${base}/api/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) });
          const data = (await res.json()) as { ok?: boolean; job?: GenerationJob; error?: string };
          if (!res.ok || !data.ok || !data.job) {
            errors.push(data.error ?? "Generation could not start.");
            continue;
          }
          opts.onGenerate?.(data.job, op as Op & { source: { type: "generate"; prompt: string } });
          notices.push(`Generating “${prompt}” with Meshy. It usually takes 1 to 3 minutes; you'll be asked to confirm when it's ready.`);
        } catch {
          errors.push("Generation is unreachable right now.");
        }
        continue;
      }
      out.push(op);
    }
    return { spec: { version: 1, ops: out }, choices, notices, errors };
  }

  return { resolve, search };
}

export function providerName(p: string): string {
  return p === "polyhaven" ? "Poly Haven" : p === "polypizza" ? "Poly Pizza" : p === "smithsonian" ? "Smithsonian" : p === "meshy" ? "Meshy (AI)" : "Built-in";
}
