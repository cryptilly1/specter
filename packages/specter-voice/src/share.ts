import type { OpRegistry } from "./registry";
import type { Spec, SpecContext } from "./types";

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Encode a Spec as a URL-safe string for `?spec=` share links. */
export function encodeSpec(spec: Spec): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(spec)));
}

/** Decode and validate a shared Spec. Anything invalid or unknown is rejected, never partially applied. */
export function decodeSpec(
  encoded: string,
  registry: OpRegistry<any>,
  ctx?: SpecContext,
  opts: { maxLength?: number } = {},
): { ok: true; spec: Spec } | { ok: false; errors: string[] } {
  if (!encoded || encoded.length > (opts.maxLength ?? 20000)) return { ok: false, errors: ["Share link is empty or too long"] };
  try {
    const json = new TextDecoder().decode(fromBase64Url(encoded));
    return registry.parseSpec(JSON.parse(json), ctx);
  } catch {
    return { ok: false, errors: ["Share link is not valid"] };
  }
}

/** Build a share URL from the current location, replacing any existing `spec` and `pack` params. */
export function buildShareUrl(href: string, spec: Spec, extra: Record<string, string> = {}): string {
  const url = new URL(href);
  url.searchParams.delete("spec");
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  if (spec.ops.length) url.searchParams.set("spec", encodeSpec(spec));
  return url.toString();
}
