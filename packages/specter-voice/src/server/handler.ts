import { z } from "zod";
import { buildSystemPrompt, buildUserPrompt, extractJson, MAX_TEXT_CHARS, slimContext } from "../llm";
import { OpRegistry } from "../registry";
import type { Spec, SpecContext } from "../types";
import { callProvider, keyFor, modelsFor, ProviderError, providerOrder, type ProviderName, type ServerEnv } from "./providers";

const MAX_BODY_CHARS = 32_000;

const contextSchema = z.object({
  app: z.string().max(40),
  subject: z.string().max(120).optional(),
  meshes: z.array(z.string().max(80)).max(120),
  hotspots: z.array(z.object({ id: z.string().max(64), mesh: z.string().max(80).optional(), title: z.string().max(80) })).max(60),
  packs: z.array(z.string().max(64)).max(30),
  cameraPresets: z.array(z.string().max(64)).max(30),
  aliases: z.record(z.string().max(60), z.string().max(80)).optional(),
  ops: z.array(z.string().max(32)).max(20).optional(),
  recipes: z.array(z.object({ id: z.string().max(64), title: z.string().max(80), keywords: z.array(z.string().max(40)).max(8) })).max(40).optional(),
  objects: z.array(z.string().max(64)).max(120).optional(),
  libraries: z.boolean().optional(),
  generate: z.boolean().optional(),
});

const bodySchema = z.object({
  text: z.string().min(1).max(MAX_TEXT_CHARS),
  context: contextSchema,
  lang: z.string().max(12).optional(),
});

export interface SpecRequest {
  method: string;
  body: unknown;
  /** Caller identity for rate limiting (IP). */
  ip?: string;
}

export interface SpecResponse {
  status: number;
  body: { spec?: Spec; error?: string; provider?: string; model?: string };
}

export interface HandlerDeps {
  fetchImpl?: typeof fetch;
  registry?: OpRegistry<any>;
  now?: () => number;
  /** Log without secrets. Defaults to console.warn for failures only. */
  log?: (msg: string) => void;
}

// ---- basic in-memory rate limiter (per server instance) ----
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40;
const hits = new Map<string, number[]>();

export function rateLimited(ip: string | undefined, now: number): boolean {
  const key = ip || "anon";
  const arr = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) {
    hits.set(key, arr);
    return true;
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return false;
}

export function resetRateLimiter(): void {
  hits.clear();
}

/**
 * POST /api/spec. Validates the request, asks a provider for a Spec, validates the answer against the same
 * registry the client uses (unknown ops and unknown targets are rejected), retries once with feedback,
 * then tries the next model/provider. Never returns provider internals or keys.
 */
export async function handleSpecRequest(req: SpecRequest, env: ServerEnv, deps: HandlerDeps = {}): Promise<SpecResponse> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((m: string) => console.warn(`[specter] ${m}`));
  if (req.method !== "POST") return { status: 405, body: { error: "Use POST" } };

  let size = 0;
  try {
    size = JSON.stringify(req.body ?? null).length;
  } catch {
    return { status: 400, body: { error: "Invalid body" } };
  }
  if (size > MAX_BODY_CHARS) return { status: 413, body: { error: "Request too large" } };
  if (rateLimited(req.ip, now())) return { status: 429, body: { error: "Too many requests. Try again in a minute." } };

  const parsedBody = bodySchema.safeParse(req.body);
  if (!parsedBody.success) return { status: 400, body: { error: "Invalid request" } };
  const { text, lang } = parsedBody.data;
  const context = slimContext(parsedBody.data.context as SpecContext);

  const providers = providerOrder(env);
  if (!providers.length) return { status: 503, body: { error: "No AI provider is configured" } };

  // Studio answers can be long (compositions of many parts), so they get more time and tokens
  const studio = Array.isArray(context.recipes);
  const TOTAL_DEADLINE_MS = studio ? 20_000 : 4500;
  const ATTEMPT_TIMEOUT_MS = studio ? 14_000 : 3200;
  const registry = deps.registry ?? new OpRegistry({ includeStudio: studio });
  const system = buildSystemPrompt(context, registry, lang);
  const user = buildUserPrompt(text);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const started = now();

  for (const provider of providers as ProviderName[]) {
    const key = keyFor(provider, env)!;
    for (const model of modelsFor(provider, env)) {
      if (now() - started > TOTAL_DEADLINE_MS) return { status: 504, body: { error: "The AI took too long" } };
      let feedback = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
        try {
          const reply = await callProvider({
            provider,
            model,
            system,
            user: user + feedback,
            signal: controller.signal,
            fetchImpl,
            key,
            maxTokens: studio ? 3500 : 900,
          });
          const json = extractJson(reply) as { error?: unknown; ops?: unknown; version?: unknown };
          if (json && typeof json === "object" && Array.isArray(json.ops) && json.ops.length === 0) {
            return { status: 200, body: { error: typeof json.error === "string" ? json.error.slice(0, 200) : "Nothing to change", provider, model } };
          }
          const checked = registry.parseSpec(json, context);
          if (checked.ok) return { status: 200, body: { spec: checked.spec, provider, model } };
          feedback = `\n\nYour previous reply was rejected: ${checked.errors.join("; ").slice(0, 400)}. Reply again with a corrected JSON object only.`;
        } catch (e) {
          if (e instanceof ProviderError) {
            log(`${provider}/${model}: ${e.message}`);
            break; // try the next model or provider
          }
          if (e instanceof SyntaxError || (e instanceof Error && e.message.includes("valid JSON"))) {
            feedback = "\n\nYour previous reply was not valid JSON. Reply with a JSON object only.";
            continue;
          }
          log(`${provider}/${model}: ${e instanceof Error ? e.name : "error"}`);
          break;
        } finally {
          clearTimeout(timer);
        }
      }
    }
  }
  return { status: 502, body: { error: "The AI could not produce a valid change" } };
}
