import type { SpecContext } from "./types";

/** Lowercase, strip punctuation, collapse separators ("Kitchen_Sink" -> "kitchen sink"). */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-./]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function singular(w: string): string {
  if (w.length > 3 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function normTokens(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter(Boolean)
    .filter((t) => !["the", "a", "an", "of", "my", "this", "that"].includes(t))
    .map(singular);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = a[i - 1] === b[j - 1] ? last : 1 + Math.min(last, prev[j]!, prev[j - 1]!);
      last = tmp;
    }
  }
  return prev[b.length]!;
}

export interface MatchResult {
  /** Canonical id, or null when nothing matched. */
  id: string | null;
  /** Closest candidates (for error messages). */
  suggestions: string[];
}

/**
 * Resolve a spoken or typed name to a known id. Order: exact id, alias, token overlap, edit distance.
 * Returns null instead of guessing when the best score is weak, so unknown targets fail loudly.
 */
export function matchTarget(name: string, candidates: string[], aliases: Record<string, string> = {}): MatchResult {
  const q = normTokens(name).join(" ");
  if (!q) return { id: null, suggestions: candidates.slice(0, 4) };

  // exact id (case-insensitive, separator-insensitive)
  for (const c of candidates) if (normTokens(c).join(" ") === q) return { id: c, suggestions: [] };

  // alias
  for (const [alias, target] of Object.entries(aliases)) {
    if (normTokens(alias).join(" ") === q && candidates.includes(target)) return { id: target, suggestions: [] };
  }

  const qTokens = q.split(" ");
  const scored = candidates.map((c) => {
    const cTokens = normTokens(c);
    const cJoined = cTokens.join(" ");
    let score = 0;
    if (cJoined.includes(q) || q.includes(cJoined)) score = 0.85;
    const overlap = qTokens.filter((t) => cTokens.includes(t)).length;
    if (overlap > 0) score = Math.max(score, (overlap / Math.max(qTokens.length, cTokens.length)) * 0.8 + 0.1);
    const dist = levenshtein(q, cJoined);
    const maxLen = Math.max(q.length, cJoined.length);
    if (maxLen > 0 && dist <= 2 && maxLen >= 4) score = Math.max(score, 1 - dist / maxLen);
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const suggestions = scored.slice(0, 4).map((s) => s.c);
  if (best && best.score >= 0.6 && (scored.length < 2 || best.score > scored[1]!.score + 0.001)) {
    return { id: best.c, suggestions };
  }
  return { id: null, suggestions };
}

export function resolveMeshName(name: string, ctx: SpecContext): MatchResult {
  return matchTarget(name, ctx.meshes, ctx.aliases);
}
