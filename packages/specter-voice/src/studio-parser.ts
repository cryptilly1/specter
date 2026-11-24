import { COLOR_NAMES, parseColorPhrase } from "./colors";
import { matchTarget, normalize } from "./match";
import type { SpecContext } from "./types";

type Op = { op: string; [k: string]: unknown };
export interface StudioClauseResult {
  ops: Op[];
  error?: string;
  warning?: string;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, couple: 2, few: 3, several: 4, some: 1, dozen: 12,
};

export function parseCount(word: string | undefined): number | null {
  if (!word) return null;
  const w = word.toLowerCase();
  if (/^\d+$/.test(w)) return Math.min(24, Math.max(1, Number(w)));
  return NUMBER_WORDS[w] ?? null;
}

function slugId(s: string): string {
  const n = normalize(s)
    .split(" ")
    .filter((w) => !["a", "an", "the", "some", "of", "big", "small", "large", "tiny", "huge", "little", "giant"].includes(w) && !COLOR_NAMES[w])
    .slice(-2)
    .join("_");
  return (n || "object").slice(0, 40);
}

function plainSingular(s: string): string {
  return s
    .split(" ")
    .map((w) => (w.length > 3 && w.endsWith("ies") ? w.slice(0, -3) + "y" : w.length > 3 && w.endsWith("es") && /(ch|sh|x|s)es$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
}

function strip(s: string): string {
  return s
    .replace(/^(?:the|a|an|my|this|that)\s+/i, "")
    .replace(/\s+(?:please|for me|now|here|there)$/i, "")
    .trim();
}

/** Resolve a name against studio objects first, then all targetable names. */
function obj(raw: string, ctx: SpecContext): { id?: string; error?: string } {
  const name = strip(raw);
  const objects = ctx.objects ?? [];
  const o = matchTarget(name, objects, ctx.aliases);
  if (o.id) return { id: o.id };
  const m = matchTarget(name, ctx.meshes, ctx.aliases);
  if (m.id) return { id: m.id };
  const pool = objects.length ? objects : ctx.meshes;
  return { error: `I couldn't find "${name}" in the scene.${pool.length ? ` Objects: ${pool.slice(0, 6).join(", ")}.` : " The scene is empty, so try building something first."}` };
}

const SHAPE_WORDS: Record<string, { shape: string; dims?: Record<string, number> }> = {
  cube: { shape: "box", dims: { width: 1, height: 1, depth: 1 } },
  box: { shape: "box", dims: { width: 1, height: 1, depth: 1 } },
  block: { shape: "box", dims: { width: 1, height: 1, depth: 1 } },
  ball: { shape: "sphere", dims: { radius: 0.5 } },
  sphere: { shape: "sphere", dims: { radius: 0.5 } },
  orb: { shape: "sphere", dims: { radius: 0.5 } },
  planet: { shape: "sphere", dims: { radius: 1 } },
  cylinder: { shape: "cylinder", dims: { radius: 0.4, height: 1 } },
  tube: { shape: "cylinder", dims: { radius: 0.3, height: 1.2 } },
  pillar: { shape: "cylinder", dims: { radius: 0.3, height: 2.5 } },
  column: { shape: "cylinder", dims: { radius: 0.3, height: 2.5 } },
  cone: { shape: "cone", dims: { radius: 0.5, height: 1 } },
  pyramid: { shape: "pyramid", dims: { radius: 0.7, height: 1 } },
  torus: { shape: "torus", dims: { radius: 0.5, tube: 0.18 } },
  donut: { shape: "torus", dims: { radius: 0.5, tube: 0.2 } },
  doughnut: { shape: "torus", dims: { radius: 0.5, tube: 0.2 } },
  ring: { shape: "ring", dims: { inner: 0.5, outer: 0.8 } },
  plane: { shape: "plane", dims: { width: 4, depth: 4 } },
  floor: { shape: "plane", dims: { width: 10, depth: 10 } },
  capsule: { shape: "capsule", dims: { radius: 0.3, height: 1 } },
  pill: { shape: "capsule", dims: { radius: 0.25, height: 0.8 } },
};

const SIZE_WORDS: Record<string, number> = { tiny: 0.35, small: 0.6, little: 0.6, big: 1.8, large: 1.8, huge: 3, giant: 4, massive: 4 };

const LAYOUTS: Record<string, string> = { row: "row", line: "row", ring: "ring", circle: "ring", grid: "grid", scatter: "scatter", pile: "scatter", cluster: "scatter" };

function recipeFor(thing: string, ctx: SpecContext): string | null {
  const t = ` ${normalize(thing)} `;
  for (const r of ctx.recipes ?? []) {
    for (const k of [r.id.replace(/-/g, " "), r.title, ...r.keywords]) {
      if (t.includes(` ${normalize(k)} `)) return r.id;
    }
  }
  return null;
}

function parseBuild(clause: string, ctx: SpecContext): StudioClauseResult | null {
  const m = clause.match(
    /^(?:please\s+)?(?:can you\s+|could you\s+|let's\s+)?(build|make|create|add|show(?: me)?|give me|put|place|draw|generate|spawn|insert|model|i want to see|i'd like to see|i would like to see|i want|i'd like|i would like|we need|i need)\s+(?:me\s+)?(?:(the|a|an|some|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|couple of|few|several|a few|a couple of|dozen)\s+)?(.+)$/i,
  );
  if (!m) return null;
  const verb = m[1]!.toLowerCase();
  const det = (m[2] ?? "").toLowerCase().replace(/^a (few|couple of)$/, "$1").replace(/ of$/, "");
  let rest = m[3]!.trim().replace(/[.!?]+$/, "");

  // placement: "... on (top of) the table"
  let on: string | undefined;
  const onM = rest.match(/^(.+?)\s+(?:on top of|on|onto|upon)\s+(?:the\s+)?(.+)$/i);
  if (onM) {
    const target = obj(onM[2]!, ctx);
    if (target.id) {
      rest = onM[1]!;
      on = target.id;
    }
  }
  // layout: "... in a ring"
  let layout: string | undefined;
  const lay = rest.match(/^(.+?)\s+in\s+an?\s+(row|line|ring|circle|grid|scatter|pile|cluster)$/i);
  if (lay) {
    rest = lay[1]!;
    layout = LAYOUTS[lay[2]!.toLowerCase()];
  }

  if (!det && verb !== "generate" && !recipeFor(rest, ctx)) {
    // "make the sofa blue", "show me the kitchen" belong to other parsers
    return null;
  }
  if (det === "the" && !recipeFor(rest, ctx)) return null;

  const count = det === "the" ? 1 : (parseCount(det) ?? 1);
  const thing = rest;
  const ops: Op[] = [];
  const base: Record<string, unknown> = on ? { on } : {};

  if (verb === "generate") {
    if (!ctx.generate) return { ops: [], error: "AI generation isn't set up here (it needs a Meshy key). Try “add a …” to search free model libraries instead." };
    ops.push({ op: "addObject", id: slugId(thing), source: { type: "generate", prompt: thing }, ...base });
  } else {
    const recipe = recipeFor(thing, ctx);
    if (recipe) {
      ops.push({ op: "addObject", id: recipe.replace(/-/g, "_"), source: { type: "recipe", recipe }, ...base });
    } else {
      const words = normalize(thing).split(" ");
      // lights
      const lightM = normalize(thing).match(/^(?:(\w+)\s+)?(spot|point|directional|ambient)?\s*light$/);
      if (lightM && (lightM[2] || !lightM[1] || COLOR_NAMES[lightM[1]])) {
        const color = lightM[1] && COLOR_NAMES[lightM[1]] ? COLOR_NAMES[lightM[1]] : undefined;
        ops.push({ op: "addLight", id: `${lightM[2] ?? "point"}_light`, kind: lightM[2] ?? "point", ...(color ? { color } : {}), position: [0, 3, 2], ...(on ? { target: on } : {}) });
        return { ops };
      }
      // labels
      const labelM = thing.match(/^(?:label|sign|text|title)\s+(?:saying|that says|reading|with)\s+["“]?(.+?)["”]?$/i);
      if (labelM) {
        ops.push({ op: "addObject", id: "label", source: { type: "primitive", part: { name: "label", shape: "label", text: labelM[1]!.slice(0, 60), position: [0, 1.5, 0] } }, ...base });
        return { ops };
      }
      // shapes, with optional size and colour words
      const shapeWord = words.map(plainSingular).find((w) => SHAPE_WORDS[w]);
      const mods = words.filter((w) => !SHAPE_WORDS[plainSingular(w)]);
      const sizeWord = mods.find((w) => SIZE_WORDS[w]);
      const colourText = mods.filter((w) => !SIZE_WORDS[w]).join(" ");
      const patch = colourText ? parseColorPhrase(colourText) : {};
      if (shapeWord && patch !== null) {
        const def = SHAPE_WORDS[shapeWord]!;
        const f = sizeWord ? SIZE_WORDS[sizeWord]! : 1;
        const dims = Object.fromEntries(Object.entries(def.dims ?? {}).map(([k, v]) => [k, Math.round(v * f * 1000) / 1000]));
        const id = slugId(`${colourText} ${shapeWord}`.trim()) || shapeWord;
        ops.push({ op: "addObject", id, source: { type: "primitive", part: { name: `${id}_mesh`, shape: def.shape, dims, ...(patch ?? {}) } }, ...base });
      } else {
        // anything else: find it in the free model libraries
        if (ctx.libraries === false) return { ops: [], error: `Model search isn't available here. Try a shape ("add a blue sphere") or a recipe: ${(ctx.recipes ?? []).map((r) => r.title).slice(0, 5).join(", ")}.` };
        const colourFirst = words.length > 1 && COLOR_NAMES[words[0]!] ? COLOR_NAMES[words[0]!] : undefined;
        const raw = (colourFirst ? words.slice(1).join(" ") : normalize(thing)).trim();
        // only singularise plurals that came with a count ("five trees"), never names like "triceratops"
        const query = count > 1 ? plainSingular(raw) : raw;
        if (!query) return { ops: [], error: "What should I add?" };
        ops.push({ op: "addObject", id: slugId(query), source: { type: "search", query }, ...(colourFirst ? { color: colourFirst } : {}), ...base });
      }
    }
  }

  if (count > 1 && ops[0]) {
    ops.push({ op: "duplicate", target: ops[0].id, count: count - 1, layout: layout ?? "row" });
  } else if (layout && ops[0] && count === 1) {
    // "add a tree in a ring" is unusual; ignore the layout
  }
  return { ops };
}

function parseRemoveObject(clause: string, ctx: SpecContext): StudioClauseResult | null {
  const m = clause.match(/^(?:please\s+)?(?:remove|delete|get rid of|take away|destroy|erase)\s+(?:the\s+)?(.+)$/i);
  if (!m) return null;
  const what = strip(m[1]!);
  if (/^(?:everything|all|all objects|it all|the whole scene|scene)$/i.test(what)) {
    const objects = ctx.objects ?? [];
    if (!objects.length) return { ops: [], error: "The scene is already empty." };
    return { ops: objects.map((id) => ({ op: "removeObject", id })) };
  }
  const o = matchTarget(what, ctx.objects ?? [], ctx.aliases);
  if (!o.id) return null; // not a studio object: other parsers (hotspots, visibility) may handle it
  return { ops: [{ op: "removeObject", id: o.id }] };
}

const DIRS: Record<string, [number, number, number]> = {
  left: [-1, 0, 0], right: [1, 0, 0], up: [0, 1, 0], higher: [0, 1, 0], upward: [0, 1, 0], upwards: [0, 1, 0],
  down: [0, -1, 0], lower: [0, -1, 0], downward: [0, -1, 0], forward: [0, 0, 1], forwards: [0, 0, 1], closer: [0, 0, 1],
  back: [0, 0, -1], backward: [0, 0, -1], backwards: [0, 0, -1], away: [0, 0, -1], further: [0, 0, -1],
};

function amount(s: string | undefined): number {
  if (!s) return 1;
  const t = s.toLowerCase();
  if (/bit|little|slightly|touch/.test(t)) return 0.4;
  if (/lot|far/.test(t)) return 3;
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.min(100, Math.max(0.01, n)) : 1;
}

function parseMove(clause: string, ctx: SpecContext): StudioClauseResult | null {
  const put = clause.match(/^(?:put|place|move|set|stand)\s+(?:the\s+)?(.+?)\s+(?:on top of|on|onto|upon)\s+(?:the\s+)?(.+)$/i);
  // "put a lantern on the table" adds a new one; only "put the lantern ..." moves an existing one
  if (put && /^(?:a|an|some|another|\d+|one|two|three|four|five)\s/i.test(put[1]!)) return null;
  if (put) {
    const a = obj(put[1]!, ctx);
    if (a.error) return { ops: [], error: a.error };
    const b = obj(put[2]!, ctx);
    if (b.error) return { ops: [], error: b.error };
    return { ops: [{ op: "transform", target: a.id, on: b.id }] };
  }
  const m = clause.match(
    /^(?:please\s+)?(?:move|shift|push|slide|nudge|bring|raise|lift|lower|drop)\s+(?:the\s+)?(.+?)\s+(left|right|up|down|higher|lower|upwards?|downwards?|forwards?|backwards?|back|closer|away|further)(?:\s+(?:by\s+)?(a (?:bit|little|lot)|slightly|a touch|far|\d+(?:\.\d+)?)\s*(?:m|meters?|metres?|units?)?)?$/i,
  );
  if (m) {
    const t = obj(m[1]!, ctx);
    if (t.error) return { ops: [], error: t.error };
    const d = DIRS[m[2]!.toLowerCase()]!;
    const a = amount(m[3]);
    return { ops: [{ op: "transform", target: t.id, move: d.map((v) => v * a) }] };
  }
  const lift = clause.match(/^(?:raise|lift)\s+(?:the\s+)?(.+)$/i);
  if (lift) {
    const t = obj(lift[1]!, ctx);
    if (t.error) return null;
    return { ops: [{ op: "transform", target: t.id, move: [0, 1, 0] }] };
  }
  return null;
}

function parseScale(clause: string, ctx: SpecContext): StudioClauseResult | null {
  let m = clause.match(/^(?:make|scale|resize|grow|shrink)\s+(?:the\s+)?(.+?)\s+(bigger|larger|smaller|tinier|huge|tiny|twice as big|twice the size|double the size|half the size|half as big|(\d+(?:\.\d+)?)\s*(?:times|x)\s*(bigger|larger|smaller)?)$/i);
  if (m) {
    const t = obj(m[1]!, ctx);
    if (t.error) return { ops: [], error: t.error };
    const w = m[2]!.toLowerCase();
    let f = 1.5;
    if (/smaller|tinier/.test(w) && !m[3]) f = 0.66;
    if (w === "huge") f = 3;
    if (w === "tiny") f = 0.33;
    if (/twice|double/.test(w)) f = 2;
    if (/half/.test(w)) f = 0.5;
    if (m[3]) f = /smaller/.test(m[4] ?? "") ? 1 / Number(m[3]) : Number(m[3]);
    return { ops: [{ op: "transform", target: t.id, scaleBy: Math.max(0.01, Math.min(100, Math.round(f * 1000) / 1000)) }] };
  }
  m = clause.match(/^(?:scale|grow)\s+(?:the\s+)?(.+?)\s+(?:by|to)\s+(\d+(?:\.\d+)?)$/i);
  if (m) {
    const t = obj(m[1]!, ctx);
    if (t.error) return { ops: [], error: t.error };
    return { ops: [{ op: "transform", target: t.id, scaleBy: Number(m[2]) }] };
  }
  m = clause.match(/^(?:shrink)\s+(?:the\s+)?(.+)$/i);
  if (m) {
    const t = obj(m[1]!, ctx);
    if (t.error) return { ops: [], error: t.error };
    return { ops: [{ op: "transform", target: t.id, scaleBy: 0.66 }] };
  }
  return null;
}

function parseRotate(clause: string, ctx: SpecContext): StudioClauseResult | null {
  const m = clause.match(/^(?:please\s+)?(?:rotate|turn|spin|tilt|twist)\s+(?:the\s+)?(.+?)\s+(?:by\s+)?(-?\d+(?:\.\d+)?)\s*(?:degrees?|deg|°)(?:\s+(?:to the\s+)?(left|right|clockwise|counterclockwise|counter-clockwise|anticlockwise|forward|forwards|back|backwards|sideways))?$/i);
  if (m) {
    const t = obj(m[1]!, ctx);
    if (t.error) return { ops: [], error: t.error };
    let deg = Number(m[2]);
    const dir = (m[3] ?? "").toLowerCase();
    if (/right|^clockwise/.test(dir)) deg = -deg;
    const rot: [number, number, number] = /forward|back/.test(dir) ? [deg, 0, 0] : /sideways/.test(dir) ? [0, 0, deg] : [0, deg, 0];
    return { ops: [{ op: "transform", target: t.id, rotateBy: rot }] };
  }
  const flip = clause.match(/^(?:flip|turn)\s+(?:the\s+)?(.+?)\s+(?:upside down|over)$/i);
  if (flip) {
    const t = obj(flip[1]!, ctx);
    if (t.error) return { ops: [], error: t.error };
    return { ops: [{ op: "transform", target: t.id, rotateBy: [180, 0, 0] }] };
  }
  const face = clause.match(/^(?:turn|rotate)\s+(?:the\s+)?(.+?)\s+around$/i);
  if (face) {
    const t = obj(face[1]!, ctx);
    if (t.error) return { ops: [], error: t.error };
    return { ops: [{ op: "transform", target: t.id, rotateBy: [0, 180, 0] }] };
  }
  return null;
}

const MOTION_WORDS: Record<string, string> = {
  spin: "spin", spinning: "spin", rotate: "spin", rotating: "spin", turn: "spin", turning: "spin", twirl: "spin",
  orbit: "orbit", orbiting: "orbit", circle: "orbit", circling: "orbit", revolve: "orbit", revolving: "orbit", "go around": "orbit", "go round": "orbit", "move around": "orbit",
  bob: "bob", bobbing: "bob", float: "bob", floating: "bob", bounce: "bob", bouncing: "bob", hover: "bob", hovering: "bob",
  pulse: "pulse", pulsing: "pulse", throb: "pulse", throbbing: "pulse", breathe: "pulse", beat: "pulse",
  swing: "swing", swinging: "swing", sway: "swing", swaying: "swing", rock: "swing", rocking: "swing", wobble: "swing",
};

function speedWord(s: string | undefined): number | undefined {
  if (!s) return undefined;
  if (/slow/.test(s)) return 0.4;
  if (/fast|quick/.test(s)) return 2.5;
  return undefined;
}

function parseAnimate(clause: string, ctx: SpecContext): StudioClauseResult | null {
  // "rotate the table 45 degrees" is a one-off turn, not a spin animation
  if (/\d+(?:\.\d+)?\s*(?:degrees?|deg|°)/i.test(clause) || /\b(?:upside down|around)$/i.test(clause) && !/\b(?:orbit|circle|revolve|go)\b/i.test(clause)) return null;
  const motionAlt = Object.keys(MOTION_WORDS).sort((a, b) => b.length - a.length).join("|");
  let m = clause.match(new RegExp(`^(?:please\\s+)?(?:make|let|have|get|set)\\s+(?:the\\s+)?(.+?)\\s+(?:start\\s+)?(${motionAlt})(?:\\s+(?:around|round|about|the|around the|round the)?\\s*(?:the\\s+)?(.+?))?(?:\\s+(slowly|slower|fast|faster|quickly))?$`, "i"));
  if (!m) {
    // "spin the sun", "orbit the moon around the earth"
    m = clause.match(new RegExp(`^(?:please\\s+)?(spin|rotate|orbit|float|bob|bounce|pulse|swing|sway|revolve)\\s+(?:the\\s+)?(.+?)(?:\\s+(?:around|round|about)\\s+(?:the\\s+)?(.+?))?(?:\\s+(slowly|slower|fast|faster|quickly))?$`, "i"));
    if (m) m = [m[0], m[2], m[1], m[3], m[4]] as unknown as RegExpMatchArray;
  }
  if (m) {
    const t = obj(m[1]!, ctx);
    if (t.error) return { ops: [], error: t.error };
    const motion = MOTION_WORDS[m[2]!.toLowerCase()]!;
    const op: Op = { op: "animate", target: t.id, motion };
    if (motion === "orbit") {
      if (!m[3]) return { ops: [], error: `What should ${t.id} orbit around? Try “make the moon orbit the earth”.` };
      const a = obj(m[3]!, ctx);
      if (a.error) return { ops: [], error: a.error };
      if (a.id === t.id) return { ops: [], error: "An object can't orbit itself." };
      op.around = a.id;
    } else if (m[3] && /^(slowly|slower|fast|faster|quickly)$/i.test(m[3])) {
      m[4] = m[3];
    }
    const sp = speedWord(m[4]);
    if (sp) op.speed = sp;
    return { ops: [op] };
  }
  const stop = clause.match(/^(?:please\s+)?(?:stop|freeze|pause|halt)\s+(?:the\s+)?(.+?)(?:\s+(?:from\s+)?(?:moving|spinning|orbiting|rotating|bobbing|animating|motion))?$/i);
  if (stop) {
    const what = strip(stop[1]!);
    if (/^(?:everything|all|it all|all animations?|animations?|all motion)$/i.test(what)) {
      const objects = ctx.objects ?? [];
      return { ops: objects.map((id) => ({ op: "animate", target: id, motion: "stop" })) };
    }
    const t = obj(what, ctx);
    if (t.error) return { ops: [], error: t.error };
    return { ops: [{ op: "animate", target: t.id, motion: "stop" }] };
  }
  return null;
}

function parseDuplicate(clause: string, ctx: SpecContext): StudioClauseResult | null {
  let m = clause.match(/^(?:duplicate|copy|clone|repeat)\s+(?:the\s+)?(.+?)(?:\s+(\w+)\s+times)?(?:\s+in\s+an?\s+(row|line|ring|circle|grid|scatter|pile|cluster))?$/i);
  if (m) {
    const t = obj(m[1]!, ctx);
    if (t.error) return { ops: [], error: t.error };
    return { ops: [{ op: "duplicate", target: t.id, count: parseCount(m[2]) ?? 1, layout: LAYOUTS[(m[3] ?? "row").toLowerCase()] ?? "row" }] };
  }
  m = clause.match(/^(?:make|add|create)\s+(\w+)\s+(?:more\s+)?(?:copies|copy|clones|duplicates)\s+of\s+(?:the\s+)?(.+?)(?:\s+in\s+an?\s+(row|line|ring|circle|grid|scatter|pile|cluster))?$/i);
  if (m) {
    const t = obj(m[2]!, ctx);
    if (t.error) return { ops: [], error: t.error };
    return { ops: [{ op: "duplicate", target: t.id, count: parseCount(m[1]) ?? 1, layout: LAYOUTS[(m[3] ?? "row").toLowerCase()] ?? "row" }] };
  }
  return null;
}

function sentence(s: string): string {
  const t = s.trim().replace(/^(?:that|about)\s+/i, "");
  if (!t) return t;
  const c = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(c) ? c : `${c}.`;
}

function parseInteraction(clause: string, ctx: SpecContext): StudioClauseResult | null {
  const m = clause.match(
    /^(?:when|whenever|if|once)\s+(?:i|you|someone|anyone|people|the user|a user|users|they|we)?\s*(click|clicks|clicked|tap|taps|tapped|press|presses|pressed|touch|touches|hover over|hovers over|hover on|hover|hovers|point at|mouse over)\s+(?:on\s+)?(?:the\s+)?(.+?)\s*(?:,|then|\s)\s*(?:then\s+)?(?:it should\s+|please\s+)?(show|display|explain|tell|say|speak|read|zoom|fly|focus|go|stop|start|toggle|pause|play|hide|reveal|highlight|glow|light up)\b\s*(.*)$/i,
  );
  if (!m) return null;
  const trigger = /hover|point|mouse/i.test(m[1]!) ? "hover" : "click";
  const t = obj(m[2]!.replace(/,$/, ""), ctx);
  if (t.error) return { ops: [], error: t.error };
  const verb = m[3]!.toLowerCase();
  let rest = (m[4] ?? "").trim().replace(/^(?:me|us|them|people|everyone|the user|users)\s+/i, "").replace(/^(?:in|to|on)\s+(?:it|on it)$/i, "");
  let action: Record<string, unknown>;
  if (/^(show|display|explain|tell)$/.test(verb)) {
    rest = rest.replace(/^(?:a\s+)?(?:message|note|text|info|information|label)\s+(?:saying|that says|with)\s+/i, "").replace(/^(?:that|about)\s+/i, "");
    if (!rest || /^(?:it|its info|info|information|details)$/i.test(rest)) return { ops: [], error: `What should appear when ${t.id} is clicked? Try “when I click the ${t.id}, show it is …”.` };
    action = { type: "showInfo", title: t.id!.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase()), body: sentence(rest).slice(0, 600) };
  } else if (/^(say|speak|read)$/.test(verb)) {
    if (!rest) return { ops: [], error: "What should it say?" };
    action = { type: "speak", text: sentence(rest).slice(0, 400) };
  } else if (/^(zoom|fly|focus|go)$/.test(verb)) {
    action = { type: "focus" };
  } else if (/^(stop|start|toggle|pause|play)$/.test(verb)) {
    action = { type: "toggleAnimation" };
  } else if (/^(hide|reveal)$/.test(verb)) {
    const other = rest.replace(/^(?:the\s+)?/, "").trim();
    const o = other && !/^(?:it|itself)$/i.test(other) ? obj(other, ctx) : { id: t.id };
    if (o.error) return { ops: [], error: o.error };
    action = { type: "toggleVisibility", target: o.id };
  } else {
    const colour = parseColorPhrase(rest.replace(/^(?:up\s+)?(?:in\s+)?/i, "") || "gold");
    action = { type: "highlight", ...(colour?.color || colour?.emissive ? { color: colour.color ?? colour.emissive } : {}) };
  }
  return { ops: [{ op: "addInteraction", target: t.id, trigger, action }] };
}

const ENV_WORDS: Record<string, string> = {
  night: "night", dark: "night", nighttime: "night", "night time": "night", midnight: "night",
  space: "space", "outer space": "space", stars: "space", starry: "space", galaxy: "space", cosmos: "space",
  sunset: "sunset", dusk: "sunset", evening: "sunset", "golden hour": "sunset", dawn: "sunset", sunrise: "sunset",
  day: "daylight", daytime: "daylight", daylight: "daylight", sunny: "daylight", outdoors: "daylight", outside: "daylight", noon: "daylight", morning: "daylight",
  studio: "studio", neutral: "studio", clean: "studio", plain: "studio",
  indoor: "indoor", indoors: "indoor", room: "indoor", inside: "indoor", cozy: "indoor", cosy: "indoor",
};

function parseEnvironment(clause: string, _ctx: SpecContext): StudioClauseResult | null {
  let m = clause.match(/^(?:please\s+)?(?:set|change|make|switch|turn)\s+(?:the\s+)?(?:environment|background|sky|scene|lighting|world|mood|setting)\s+(?:to|into)\s+(?:a\s+|an\s+)?(.+)$/i);
  if (!m) m = clause.match(/^(?:please\s+)?(?:make it|it should be|change it to|switch to|go to)\s+(?:a\s+|an\s+)?(night|nighttime|night time|dark|space|outer space|sunset|dusk|evening|dawn|sunrise|day|daytime|daylight|sunny|studio|indoors?)(?:\s+(?:time|mode))?$/i);
  if (m) {
    const w = normalize(m[1]!.replace(/\s+(?:time|mode|sky|scene)$/i, ""));
    const preset = ENV_WORDS[w];
    if (preset) return { ops: [{ op: "setEnvironment", preset }] };
    const colour = parseColorPhrase(m[1]!);
    if (colour?.color) return { ops: [{ op: "setEnvironment", background: colour.color }] };
    return { ops: [], error: `I know these environments: studio, indoor, daylight, sunset, night, space.` };
  }
  if (/^(?:remove|hide|delete|turn off)\s+(?:the\s+)?(?:ground|floor|grid)$/i.test(clause)) return { ops: [{ op: "setEnvironment", ground: false }] };
  if (/^(?:show|bring back|turn on|add back)\s+(?:the\s+)?(?:ground|floor|grid)$/i.test(clause)) return { ops: [{ op: "setEnvironment", ground: true }] };
  return null;
}

/** Studio parsers in the order they must be tried. Each returns null when the clause is not for it. */
export const STUDIO_PARSERS: ((clause: string, ctx: SpecContext) => StudioClauseResult | null)[] = [
  parseInteraction,
  parseEnvironment,
  parseRemoveObject,
  parseDuplicate,
  parseAnimate,
  parseMove,
  parseScale,
  parseRotate,
  parseBuild,
];
