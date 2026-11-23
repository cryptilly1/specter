export const COLOR_NAMES: Record<string, string> = {
  red: "#dc2626",
  crimson: "#b91c1c",
  maroon: "#7f1d1d",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#facc15",
  gold: "#d4a017",
  golden: "#d4a017",
  lime: "#84cc16",
  green: "#16a34a",
  olive: "#6b7d1f",
  emerald: "#059669",
  teal: "#0d9488",
  turquoise: "#14b8a6",
  cyan: "#06b6d4",
  aqua: "#22d3ee",
  blue: "#2563eb",
  navy: "#1e3a8a",
  indigo: "#4f46e5",
  purple: "#9333ea",
  violet: "#7c3aed",
  lavender: "#a78bfa",
  magenta: "#d946ef",
  pink: "#ec4899",
  rose: "#f43f5e",
  white: "#f8fafc",
  black: "#111111",
  gray: "#6b7280",
  grey: "#6b7280",
  silver: "#c0c4cc",
  brown: "#7c4a21",
  tan: "#c8a27a",
  beige: "#e8dcc2",
  cream: "#f5ecd7",
  bronze: "#a8713a",
  copper: "#b87333",
  charcoal: "#374151",
  ivory: "#f8f4e3",
};

export interface MaterialPatch {
  color?: string;
  emissive?: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mix(hex: string, target: [number, number, number], t: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (target[0] - r) * t, g + (target[1] - g) * t, b + (target[2] - b) * t);
}

const FILLER = new Set(["a", "an", "the", "to", "be", "into", "in", "with", "is", "it", "its", "color", "colour"]);

/**
 * Parse a phrase like "matte black", "light blue", "glowing red", "#3b82f6", "transparent" into a material patch.
 * Every token must be understood. Returns null otherwise so the caller can try a different split.
 */
export function parseColorPhrase(phrase: string): MaterialPatch | null {
  const hexMatch = phrase.trim().match(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hexMatch) return { color: phrase.trim().toLowerCase() };

  const tokens = phrase
    .toLowerCase()
    .replace(/[,.!?]/g, "")
    .split(/\s+/)
    .filter((t) => t && !FILLER.has(t));
  if (!tokens.length) return null;

  const patch: MaterialPatch = {};
  let tone: "light" | "dark" | null = null;
  let glow = false;
  let sawSomething = false;

  for (const t of tokens) {
    if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(t)) {
      patch.color = t;
    } else if (COLOR_NAMES[t]) {
      patch.color = COLOR_NAMES[t];
    } else if (t === "light" || t === "pale" || t === "bright" || t === "pastel") {
      tone = "light";
    } else if (t === "dark" || t === "deep") {
      tone = "dark";
    } else if (t === "glow" || t === "glowing" || t === "glowy" || t === "luminous") {
      glow = true;
    } else if (t === "matte" || t === "matt" || t === "rough") {
      patch.roughness = 0.95;
      patch.metalness = 0;
    } else if (t === "glossy" || t === "shiny" || t === "polished" || t === "smooth") {
      patch.roughness = 0.12;
    } else if (t === "metallic" || t === "metal") {
      patch.metalness = 0.9;
      patch.roughness = patch.roughness ?? 0.3;
    } else if (t === "transparent" || t === "see-through" || t === "glassy" || t === "translucent") {
      patch.opacity = 0.35;
    } else if (t === "opaque" || t === "solid") {
      patch.opacity = 1;
    } else {
      return null;
    }
    sawSomething = true;
  }
  if (!sawSomething) return null;

  if (patch.color && tone) {
    patch.color = tone === "light" ? mix(patch.color, [255, 255, 255], 0.4) : mix(patch.color, [0, 0, 0], 0.4);
  } else if (!patch.color && tone && !glow) {
    return null; // "light" alone is not a color
  }
  if (glow) {
    patch.emissive = patch.color ?? "#ffd27a";
    // "glow red" should light the object up, not repaint it
    delete patch.color;
  }
  return patch;
}
