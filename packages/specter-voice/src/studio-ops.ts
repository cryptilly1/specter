import { z } from "zod";
import type { CoreOpMeta } from "./ops";

/**
 * Studio ops: build a scene from nothing. Objects come only from shapes (primitives), named compositions of
 * shapes, built-in recipes, licensed library assets, or labelled AI generation. Never from code.
 */

const name = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9 _-]*$/, "names use letters, numbers, spaces, - and _");
const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const vec3 = (min: number, max: number) => z.tuple([num(min, max), num(min, max), num(min, max)]);
const hex = z.string().trim().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

export const SHAPES = ["box", "sphere", "cylinder", "cone", "torus", "ring", "plane", "capsule", "pyramid", "label", "pointLight", "spotLight"] as const;
export type ShapeName = (typeof SHAPES)[number];

export const partSchema = z.object({
  name,
  shape: z.enum(SHAPES),
  /** Shape dimensions in metres. Unused fields are ignored. */
  dims: z
    .object({
      width: num(0.001, 100).optional(),
      height: num(0.001, 100).optional(),
      depth: num(0.001, 100).optional(),
      radius: num(0.001, 100).optional(),
      tube: num(0.001, 50).optional(),
      inner: num(0, 100).optional(),
      outer: num(0.001, 100).optional(),
      /** Partial sweep in degrees (torus, ring, cylinder). */
      arc: num(1, 360).optional(),
    })
    .optional(),
  position: vec3(-500, 500).optional(),
  /** Degrees. */
  rotation: vec3(-720, 720).optional(),
  scale: vec3(0.001, 100).optional(),
  color: hex.optional(),
  emissive: hex.optional(),
  emissiveIntensity: num(0, 20).optional(),
  roughness: num(0, 1).optional(),
  metalness: num(0, 1).optional(),
  opacity: num(0, 1).optional(),
  /** Text for `label` parts. */
  text: z.string().trim().min(1).max(60).optional(),
  /** Light strength for light parts. */
  intensity: num(0, 5000).optional(),
  /** Name of another part in the same object to nest under. */
  parent: name.optional(),
});
export type Part = z.infer<typeof partSchema>;

const assetSource = z.object({
  type: z.literal("asset"),
  provider: z.enum(["catalogue", "polyhaven", "polypizza", "smithsonian", "meshy"]),
  assetId: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  url: z.string().url().max(600),
  urlMap: z.record(z.string().max(200), z.string().url().max(600)).optional(),
  license: z.object({ id: z.string().max(40), label: z.string().max(60), attributionRequired: z.boolean() }),
  credit: z.string().trim().min(1).max(300),
  sourceUrl: z.string().url().max(600),
  platformCredit: z.object({ text: z.string().max(80), url: z.string().url().max(200) }).optional(),
  thumbnail: z.string().url().max(600).optional(),
});
export type AssetSource = z.infer<typeof assetSource>;

export const objectSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("primitive"), part: partSchema }),
  z.object({ type: z.literal("composite"), parts: z.array(partSchema).min(1).max(60) }),
  z.object({ type: z.literal("recipe"), recipe: z.string().trim().min(1).max(64) }),
  z.object({ type: z.literal("search"), query: z.string().trim().min(1).max(80) }),
  z.object({ type: z.literal("generate"), prompt: z.string().trim().min(3).max(300) }),
  assetSource,
]);
export type ObjectSource = z.infer<typeof objectSourceSchema>;

export const addObjectSchema = z.object({
  op: z.literal("addObject"),
  id: name,
  source: objectSourceSchema,
  position: vec3(-500, 500).optional(),
  rotation: vec3(-720, 720).optional(),
  scale: num(0.001, 100).optional(),
  /** Fit the object to this height in metres (library and generated models arrive at random sizes). */
  height: num(0.01, 200).optional(),
  /** Place on top of another object. */
  on: name.optional(),
  /** Tint every part of the object. */
  color: hex.optional(),
});

export const removeObjectSchema = z.object({ op: z.literal("removeObject"), id: name });

export const transformSchema = z
  .object({
    op: z.literal("transform"),
    target: name,
    position: vec3(-500, 500).optional(),
    /** Relative move in metres. */
    move: vec3(-500, 500).optional(),
    /** Absolute rotation in degrees. */
    rotation: vec3(-720, 720).optional(),
    /** Relative rotation in degrees. */
    rotateBy: vec3(-720, 720).optional(),
    scale: z.union([num(0.001, 100), vec3(0.001, 100)]).optional(),
    /** Multiply the current scale. */
    scaleBy: num(0.01, 100).optional(),
    on: name.optional(),
  })
  .refine((o) => ["position", "move", "rotation", "rotateBy", "scale", "scaleBy", "on"].some((k) => (o as Record<string, unknown>)[k] !== undefined), {
    message: "transform needs at least one change",
  });

export const duplicateSchema = z.object({
  op: z.literal("duplicate"),
  target: name,
  count: z.number().int().min(1).max(24),
  layout: z.enum(["row", "ring", "grid", "scatter"]).default("row"),
  spacing: num(0.01, 50).optional(),
  radius: num(0.05, 100).optional(),
});

export const addLightSchema = z.object({
  op: z.literal("addLight"),
  id: name,
  kind: z.enum(["point", "spot", "directional", "ambient"]),
  color: hex.optional(),
  intensity: num(0, 5000).optional(),
  position: vec3(-500, 500).optional(),
  /** Object the light points at (spot and directional). */
  target: name.optional(),
});

export const ENVIRONMENTS = ["studio", "indoor", "night", "space", "sunset", "daylight"] as const;
export const setEnvironmentSchema = z
  .object({
    op: z.literal("setEnvironment"),
    preset: z.enum(ENVIRONMENTS).optional(),
    /** Poly Haven HDRI id, e.g. "kloofendal_48d_partly_cloudy_puresky". */
    hdri: z.string().trim().regex(/^[a-z0-9_]{2,80}$/).optional(),
    background: hex.optional(),
    ground: z.boolean().optional(),
  })
  .refine((o) => o.preset !== undefined || o.hdri !== undefined || o.background !== undefined || o.ground !== undefined, { message: "setEnvironment needs a preset, hdri, background or ground" });

export const MOTIONS = ["spin", "orbit", "bob", "pulse", "swing", "stop"] as const;
export const animateSchema = z.object({
  op: z.literal("animate"),
  target: name,
  motion: z.enum(MOTIONS),
  /** For orbit: what to circle around. */
  around: name.optional(),
  axis: z.enum(["x", "y", "z"]).optional(),
  /** 1 = normal speed. */
  speed: num(0.01, 20).optional(),
  /** Orbit radius in metres. Defaults to the current distance. */
  radius: num(0.01, 500).optional(),
});

const action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("showInfo"), title: z.string().trim().min(1).max(80).optional(), body: z.string().trim().min(1).max(600) }),
  z.object({ type: z.literal("focus") }),
  z.object({ type: z.literal("toggleAnimation") }),
  z.object({ type: z.literal("toggleVisibility"), target: name }),
  z.object({ type: z.literal("highlight"), color: hex.optional() }),
  z.object({ type: z.literal("speak"), text: z.string().trim().min(1).max(400) }),
]);
export const addInteractionSchema = z.object({
  op: z.literal("addInteraction"),
  target: name,
  trigger: z.enum(["click", "hover"]),
  action,
});
export const removeInteractionSchema = z.object({ op: z.literal("removeInteraction"), target: name, trigger: z.enum(["click", "hover"]).optional() });

export type AddObjectOp = z.infer<typeof addObjectSchema>;
export type RemoveObjectOp = z.infer<typeof removeObjectSchema>;
export type TransformOp = z.infer<typeof transformSchema>;
export type DuplicateOp = z.infer<typeof duplicateSchema>;
export type AddLightOp = z.infer<typeof addLightSchema>;
export type SetEnvironmentOp = z.infer<typeof setEnvironmentSchema>;
export type AnimateOp = z.infer<typeof animateSchema>;
export type AddInteractionOp = z.infer<typeof addInteractionSchema>;
export type RemoveInteractionOp = z.infer<typeof removeInteractionSchema>;
export type InteractionAction = z.infer<typeof action>;

const nice = (s: unknown) => String(s ?? "").replace(/[_-]+/g, " ");
const fmt = (v?: number[]) => (v ? `(${v.map((n) => Math.round(n * 100) / 100).join(", ")})` : "");

function describeSource(o: AddObjectOp): string {
  const s = o.source;
  switch (s.type) {
    case "primitive":
      return `${s.part.shape}`;
    case "composite":
      return `${s.parts.length} shapes`;
    case "recipe":
      return `the "${nice(s.recipe)}" recipe`;
    case "search":
      return `a free model for "${s.query}"`;
    case "generate":
      return `an AI-generated model of "${s.prompt}"`;
    case "asset":
      return `"${s.title}" (${s.provider}, ${s.license.label})`;
  }
}

export const studioOpMeta: CoreOpMeta[] = [
  {
    name: "addObject" as never,
    schema: addObjectSchema as never,
    doc: '{"op":"addObject","id":"<new unique name>","source":<source>,"position":[x,y,z]?,"height":<metres>?,"on":"<object to sit on>"?,"color":"#rrggbb"?}  sources: {"type":"recipe","recipe":"<recipe id>"} | {"type":"search","query":"<thing to find in free model libraries>"} | {"type":"primitive","part":<part>} | {"type":"composite","parts":[<part>,...]} | {"type":"generate","prompt":"<description>"} (only when the user says generate). part = {"name":"<unique>","shape":"box|sphere|cylinder|cone|torus|ring|plane|capsule|pyramid|label|pointLight|spotLight","dims":{"width","height","depth","radius","tube","inner","outer","arc"}?,"position":[x,y,z]?,"rotation":[deg,deg,deg]?,"color":"#rrggbb"?,"emissive":"#rrggbb"?,"opacity":0-1?,"text":"<label text>"?,"parent":"<part name>"?}',
    describe: (o: AddObjectOp) => `Add ${nice(o.id)}: ${describeSource(o)}${o.on ? ` on ${nice(o.on)}` : ""}${o.position ? ` at ${fmt(o.position)}` : ""}`,
  },
  {
    name: "removeObject" as never,
    schema: removeObjectSchema as never,
    doc: '{"op":"removeObject","id":"<object>"}',
    describe: (o: RemoveObjectOp) => `Delete ${nice(o.id)}`,
  },
  {
    name: "transform" as never,
    schema: transformSchema as never,
    doc: '{"op":"transform","target":"<object>","move":[dx,dy,dz]?,"position":[x,y,z]?,"rotateBy":[deg,deg,deg]?,"rotation":[deg,deg,deg]?,"scaleBy":<factor>?,"scale":<n>?,"on":"<object>"?}  (y is up, metres)',
    describe: (o: TransformOp) => {
      const bits: string[] = [];
      if (o.move) bits.push(`move by ${fmt(o.move)}`);
      if (o.position) bits.push(`move to ${fmt(o.position)}`);
      if (o.rotateBy) bits.push(`rotate by ${fmt(o.rotateBy)}°`);
      if (o.rotation) bits.push(`rotation ${fmt(o.rotation)}°`);
      if (o.scaleBy) bits.push(`scale ×${o.scaleBy}`);
      if (o.scale !== undefined) bits.push(`scale ${Array.isArray(o.scale) ? fmt(o.scale) : o.scale}`);
      if (o.on) bits.push(`put on ${nice(o.on)}`);
      return `${nice(o.target)}: ${bits.join(", ")}`;
    },
  },
  {
    name: "duplicate" as never,
    schema: duplicateSchema as never,
    doc: '{"op":"duplicate","target":"<object>","count":1-24,"layout":"row|ring|grid|scatter","spacing":<m>?,"radius":<m>?}',
    describe: (o: DuplicateOp) => `Make ${o.count} ${o.count === 1 ? "copy" : "copies"} of ${nice(o.target)} in a ${o.layout ?? "row"}`,
  },
  {
    name: "addLight" as never,
    schema: addLightSchema as never,
    doc: '{"op":"addLight","id":"<name>","kind":"point|spot|directional|ambient","color":"#rrggbb"?,"intensity":<n>?,"position":[x,y,z]?,"target":"<object>"?}',
    describe: (o: AddLightOp) => `Add a ${o.kind} light${o.target ? ` aimed at ${nice(o.target)}` : ""}`,
  },
  {
    name: "setEnvironment" as never,
    schema: setEnvironmentSchema as never,
    doc: '{"op":"setEnvironment","preset":"studio|indoor|night|space|sunset|daylight"?,"background":"#rrggbb"?,"ground":true|false?}',
    describe: (o: SetEnvironmentOp) => `Set the environment${o.preset ? ` to ${o.preset}` : ""}${o.hdri ? ` (sky ${nice(o.hdri)})` : ""}${o.ground === false ? ", no ground" : ""}`,
  },
  {
    name: "animate" as never,
    schema: animateSchema as never,
    doc: '{"op":"animate","target":"<object>","motion":"spin|orbit|bob|pulse|swing|stop","around":"<object to orbit>"?,"axis":"x|y|z"?,"speed":<1 = normal>?,"radius":<m>?}',
    describe: (o: AnimateOp) => (o.motion === "stop" ? `Stop ${nice(o.target)} moving` : `Make ${nice(o.target)} ${o.motion}${o.around ? ` around ${nice(o.around)}` : ""}${o.speed && o.speed !== 1 ? ` (speed ${o.speed})` : ""}`),
  },
  {
    name: "addInteraction" as never,
    schema: addInteractionSchema as never,
    doc: '{"op":"addInteraction","target":"<object>","trigger":"click|hover","action":{"type":"showInfo","title"?,"body"} | {"type":"focus"} | {"type":"toggleAnimation"} | {"type":"toggleVisibility","target":"<object>"} | {"type":"highlight","color"?} | {"type":"speak","text"}}',
    describe: (o: AddInteractionOp) => {
      const a = o.action;
      const what =
        a.type === "showInfo" ? `show "${a.title ?? a.body.slice(0, 40)}"` : a.type === "focus" ? "zoom to it" : a.type === "toggleAnimation" ? "start or stop its motion" : a.type === "toggleVisibility" ? `show or hide ${nice(a.target)}` : a.type === "highlight" ? "highlight it" : `say "${a.text.slice(0, 40)}"`;
      return `When ${nice(o.target)} is ${o.trigger === "click" ? "clicked" : "hovered"}, ${what}`;
    },
  },
  {
    name: "removeInteraction" as never,
    schema: removeInteractionSchema as never,
    doc: '{"op":"removeInteraction","target":"<object>","trigger":"click|hover"?}',
    describe: (o: RemoveInteractionOp) => `Remove ${o.trigger ?? "all"} interactions from ${nice(o.target)}`,
  },
];

export const STUDIO_OP_NAMES = studioOpMeta.map((m) => m.name as string);

/** Every name an op creates. Later ops in the same Spec may reference these. */
export function namesCreatedBy(op: { op: string; [k: string]: unknown }): string[] {
  if (op.op === "addLight" && typeof op.id === "string") return [op.id];
  if (op.op !== "addObject" || typeof op.id !== "string") return [];
  const out = [op.id];
  const src = op.source as ObjectSource | undefined;
  if (src?.type === "primitive") out.push(src.part.name);
  if (src?.type === "composite") out.push(...src.parts.map((p) => p.name));
  return out;
}
