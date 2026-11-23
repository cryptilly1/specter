import { slimContext } from "./llm";
import { parseCommand } from "./parser";
import { OpRegistry } from "./registry";
import type { InterpretSource, Spec, SpecContext } from "./types";

export interface InterpretOptions {
  /** Serverless endpoint. Default "/api/spec". */
  endpoint?: string;
  /** LLM request timeout. Default 4000 ms. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  registry?: OpRegistry<any>;
  /** Skip the LLM entirely (offline mode, tests, demo mode). */
  localOnly?: boolean;
  /** BCP-47 language code of the user's input, e.g. "es-ES". */
  lang?: string;
}

export type InterpretOutcome =
  | { ok: true; spec: Spec; source: InterpretSource; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

const DEFAULT_REGISTRY = new OpRegistry();

/**
 * Turn text into a validated Spec. Chain: LLM (`/api/spec`) -> local deterministic parser.
 * Anything the LLM returns is re-validated against the registry and the scene context before it is trusted.
 */
export async function interpret(text: string, ctx: SpecContext, opts: InterpretOptions = {}): Promise<InterpretOutcome> {
  const registry = opts.registry ?? DEFAULT_REGISTRY;
  const warnings: string[] = [];
  const clean = text.trim();
  if (!clean) return { ok: false, errors: ["Say or type a command first."], warnings };

  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (!opts.localOnly && !offline) {
    const f = opts.fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);
    if (f) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 4000);
      try {
        const res = await f(opts.endpoint ?? "/api/spec", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: clean, context: slimContext(ctx), lang: opts.lang }),
          signal: controller.signal,
        });
        if (!res.ok) {
          warnings.push(`AI service unavailable (${res.status}); used the built-in parser.`);
        } else {
          const data = (await res.json()) as { spec?: unknown; error?: string };
          if (data.spec) {
            const parsed = registry.parseSpec(data.spec, ctx);
            if (parsed.ok) return { ok: true, spec: parsed.spec, source: "llm", warnings };
            warnings.push("AI answer did not match this scene; used the built-in parser.");
          } else {
            warnings.push(data.error ? `AI: ${data.error}` : "AI returned nothing; used the built-in parser.");
          }
        }
      } catch {
        warnings.push("AI service unreachable; used the built-in parser.");
      } finally {
        clearTimeout(timer);
      }
    }
  }

  const local = parseCommand(clean, ctx, registry);
  if (local.spec) {
    // partial success: apply what was understood and tell the user about the rest
    return { ok: true, spec: local.spec, source: "local", warnings: [...warnings, ...local.warnings, ...local.errors] };
  }
  return { ok: false, errors: local.errors.length ? local.errors : ["I didn't understand that."], warnings: [...warnings, ...local.warnings] };
}
