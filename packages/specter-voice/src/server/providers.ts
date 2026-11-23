/** Server-side LLM provider adapters. Keys are read by the caller from environment variables and never logged. */
export type ProviderName = "groq" | "openai" | "anthropic";

export interface ServerEnv {
  GROQ_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  /** Preferred provider. Defaults to the first one with a key, in the order groq, openai, anthropic. */
  SPECTER_PROVIDER?: string;
  GROQ_MODEL?: string;
  OPENAI_MODEL?: string;
  ANTHROPIC_MODEL?: string;
}

export interface ProviderCall {
  provider: ProviderName;
  model: string;
  system: string;
  user: string;
  signal: AbortSignal;
  fetchImpl: typeof fetch;
  key: string;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Groq model ids change often. Try the configured one first, then known-good fallbacks. */
export const GROQ_MODELS = ["openai/gpt-oss-20b", "llama-3.3-70b-versatile", "openai/gpt-oss-120b", "llama-3.1-8b-instant"];
export const OPENAI_MODELS = ["gpt-4o-mini", "gpt-4.1-mini"];
export const ANTHROPIC_MODELS = ["claude-3-5-haiku-latest", "claude-haiku-4-5"];

export function modelsFor(provider: ProviderName, env: ServerEnv): string[] {
  const configured = provider === "groq" ? env.GROQ_MODEL : provider === "openai" ? env.OPENAI_MODEL : env.ANTHROPIC_MODEL;
  const defaults = provider === "groq" ? GROQ_MODELS : provider === "openai" ? OPENAI_MODELS : ANTHROPIC_MODELS;
  return [...new Set([configured, ...defaults].filter((m): m is string => !!m))];
}

export function keyFor(provider: ProviderName, env: ServerEnv): string | undefined {
  const k = provider === "groq" ? env.GROQ_API_KEY : provider === "openai" ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

export function providerOrder(env: ServerEnv): ProviderName[] {
  const all: ProviderName[] = ["groq", "openai", "anthropic"];
  const preferred = env.SPECTER_PROVIDER?.toLowerCase() as ProviderName | undefined;
  const ordered = preferred && all.includes(preferred) ? [preferred, ...all.filter((p) => p !== preferred)] : all;
  return ordered.filter((p) => keyFor(p, env));
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/** OpenAI-compatible chat completion (Groq and OpenAI). Returns the assistant text. */
async function openAiStyle(url: string, c: ProviderCall, extra: Record<string, unknown>): Promise<string> {
  const base = {
    model: c.model,
    temperature: 0.2,
    max_tokens: 900,
    messages: [
      { role: "system", content: c.system },
      { role: "user", content: c.user },
    ],
    ...extra,
  };
  const post = (body: Record<string, unknown>) =>
    c.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${c.key}` },
      body: JSON.stringify(body),
      signal: c.signal,
    });

  let res = await post({ ...base, response_format: { type: "json_object" } });
  if (res.status === 400) {
    // some models reject JSON mode or extra params; the prompt already demands JSON, so retry plain
    const { reasoning_effort: _r, ...plain } = base as Record<string, unknown>;
    res = await post(plain);
  }
  if (!res.ok) {
    const j = await readJson(res);
    throw new ProviderError(`${c.provider} ${res.status}: ${String(j?.error?.message ?? "request failed").slice(0, 160)}`, res.status);
  }
  const j = await readJson(res);
  const text = j?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new ProviderError(`${c.provider} returned an empty reply`);
  return text;
}

export async function callProvider(c: ProviderCall): Promise<string> {
  if (c.provider === "groq") {
    const extra: Record<string, unknown> = c.model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {};
    return openAiStyle("https://api.groq.com/openai/v1/chat/completions", c, extra);
  }
  if (c.provider === "openai") {
    return openAiStyle("https://api.openai.com/v1/chat/completions", c, {});
  }
  const res = await c.fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": c.key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: c.model,
      max_tokens: 900,
      temperature: 0.2,
      system: c.system,
      messages: [{ role: "user", content: c.user }],
    }),
    signal: c.signal,
  });
  if (!res.ok) {
    const j = await readJson(res);
    throw new ProviderError(`anthropic ${res.status}: ${String(j?.error?.message ?? "request failed").slice(0, 160)}`, res.status);
  }
  const j = await readJson(res);
  const text = j?.content?.find?.((b: { type: string }) => b.type === "text")?.text;
  if (typeof text !== "string" || !text.trim()) throw new ProviderError("anthropic returned an empty reply");
  return text;
}
