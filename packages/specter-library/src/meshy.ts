import { isBlocked } from "./providers";
import { isAllowedAssetUrl, LICENSES, type AssetCandidate } from "./types";

const BASE = "https://api.meshy.ai/openapi/v2/text-to-3d";

export type GenerateStage = "preview" | "refine";

export interface GenerateStatus {
  ok: boolean;
  /** Present while running. Pass it back on the next poll. */
  job?: { id: string; stage: GenerateStage };
  /** 0-100 across both stages. */
  progress?: number;
  done?: boolean;
  candidate?: AssetCandidate;
  error?: string;
}

interface Deps {
  fetchImpl?: typeof fetch;
}

async function call(key: string, init: { method: "GET" | "POST"; path?: string; body?: unknown }, deps: Deps): Promise<{ status: number; json: any }> {
  const f = deps.fetchImpl ?? fetch;
  const res = await f(`${BASE}${init.path ?? ""}`, {
    method: init.method,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  let json: any = {};
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json };
}

function readableError(status: number, json: any): string {
  if (status === 401) return "The Meshy key was rejected.";
  if (status === 402) return "Meshy needs a paid plan or more credits for this.";
  if (status === 403) return "Meshy declined that prompt.";
  if (status === 429) return "Meshy is busy. Try again in a minute.";
  return String(json?.message ?? `Meshy error ${status}`).slice(0, 160);
}

/** Start a text-to-3D job (shape preview first). The key never leaves the server. */
export async function startGeneration(prompt: string, key: string, deps: Deps = {}): Promise<GenerateStatus> {
  const p = prompt.trim().slice(0, 300);
  if (p.length < 3) return { ok: false, error: "Describe the object in a few words." };
  if (isBlocked(p)) return { ok: false, error: "That kind of object can't be generated here." };
  const r = await call(key, { method: "POST", body: { mode: "preview", prompt: p, ai_model: "latest", should_remesh: true, target_polycount: 30000, moderation: true, target_formats: ["glb"] } }, deps);
  if (r.status >= 300 || typeof r.json?.result !== "string") return { ok: false, error: readableError(r.status, r.json) };
  return { ok: true, job: { id: r.json.result, stage: "preview" }, progress: 0 };
}

/** Poll a job. When the preview succeeds it starts texturing automatically and returns the new job id. */
export async function pollGeneration(job: { id: string; stage: GenerateStage }, prompt: string, key: string, deps: Deps = {}): Promise<GenerateStatus> {
  if (!/^[A-Za-z0-9-]{8,80}$/.test(job.id)) return { ok: false, error: "Invalid job id" };
  const r = await call(key, { method: "GET", path: `/${job.id}` }, deps);
  if (r.status >= 300) return { ok: false, error: readableError(r.status, r.json) };
  const t = r.json ?? {};
  const pct = Math.max(0, Math.min(100, Number(t.progress ?? 0)));
  if (t.status === "FAILED" || t.status === "CANCELED" || t.status === "EXPIRED") {
    return { ok: false, error: String(t.task_error?.message ?? "Generation failed. Try a simpler description.").slice(0, 160) };
  }
  if (t.status !== "SUCCEEDED") {
    return { ok: true, job, progress: job.stage === "preview" ? Math.round(pct / 2) : 50 + Math.round(pct / 2) };
  }
  if (job.stage === "preview") {
    const refine = await call(key, { method: "POST", body: { mode: "refine", preview_task_id: job.id, enable_pbr: true, target_formats: ["glb"] } }, deps);
    if (refine.status >= 300 || typeof refine.json?.result !== "string") {
      // texturing failed to start: the untextured shape is still usable
      return finish(t, prompt, "untextured");
    }
    return { ok: true, job: { id: refine.json.result, stage: "refine" }, progress: 50 };
  }
  return finish(t, prompt, "textured");
}

function finish(t: any, prompt: string, note: string): GenerateStatus {
  const url = String(t?.model_urls?.glb ?? "");
  if (!isAllowedAssetUrl(url)) return { ok: false, error: "Meshy returned a model from an unexpected address." };
  const title = prompt.trim().slice(0, 60);
  return {
    ok: true,
    done: true,
    progress: 100,
    candidate: {
      provider: "meshy",
      assetId: String(t.id),
      title,
      url,
      thumbnail: typeof t.thumbnail_url === "string" ? t.thumbnail_url : undefined,
      license: LICENSES.generated,
      credit: `"${title}" generated with Meshy (${note}). Download links from Meshy expire, so export the scene to keep it.`,
      sourceUrl: "https://www.meshy.ai",
    },
  };
}
