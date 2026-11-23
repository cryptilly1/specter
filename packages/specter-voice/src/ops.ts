import { z } from "zod";

const id = z.string().trim().min(1).max(64);
const meshName = z.string().trim().min(1).max(96);
const vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const hexColor = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "color must be a hex string like #3b82f6");

export const addHotspotSchema = z
  .object({
    op: z.literal("addHotspot"),
    id: id.optional(),
    mesh: meshName.optional(),
    position: vec3.optional(),
    title: z.string().trim().min(1).max(80),
    body: z.string().trim().min(1).max(600),
  })
  .refine((o) => o.mesh !== undefined || o.position !== undefined, {
    message: "addHotspot needs a mesh or a position",
  });

export const updateHotspotSchema = z
  .object({
    op: z.literal("updateHotspot"),
    id,
    title: z.string().trim().min(1).max(80).optional(),
    body: z.string().trim().min(1).max(600).optional(),
  })
  .refine((o) => o.title !== undefined || o.body !== undefined, {
    message: "updateHotspot needs a title or a body",
  });

export const removeHotspotSchema = z.object({ op: z.literal("removeHotspot"), id });

export const setMaterialSchema = z
  .object({
    op: z.literal("setMaterial"),
    mesh: meshName,
    color: hexColor.optional(),
    emissive: hexColor.optional(),
    roughness: z.number().min(0).max(1).optional(),
    metalness: z.number().min(0).max(1).optional(),
    opacity: z.number().min(0).max(1).optional(),
  })
  .refine(
    (o) =>
      o.color !== undefined ||
      o.emissive !== undefined ||
      o.roughness !== undefined ||
      o.metalness !== undefined ||
      o.opacity !== undefined,
    { message: "setMaterial needs at least one property to change" },
  );

export const addNoteSchema = z
  .object({
    op: z.literal("addNote"),
    id: id.optional(),
    mesh: meshName.optional(),
    position: vec3.optional(),
    text: z.string().trim().min(1).max(300),
  })
  .refine((o) => o.mesh !== undefined || o.position !== undefined, {
    message: "addNote needs a mesh or a position",
  });

export const setCameraSchema = z
  .object({
    op: z.literal("setCamera"),
    to: z.string().trim().min(1).max(64).optional(),
    mode: z.enum(["orbit", "path"]).optional(),
  })
  .refine((o) => o.to !== undefined || o.mode !== undefined, {
    message: "setCamera needs a target (to) or a mode",
  });

export const loadPackSchema = z.object({ op: z.literal("loadPack"), pack: z.string().trim().min(1).max(64) });

export const setVisibilitySchema = z.object({
  op: z.literal("setVisibility"),
  mesh: meshName,
  visible: z.boolean(),
});

export type AddHotspotOp = z.infer<typeof addHotspotSchema>;
export type UpdateHotspotOp = z.infer<typeof updateHotspotSchema>;
export type RemoveHotspotOp = z.infer<typeof removeHotspotSchema>;
export type SetMaterialOp = z.infer<typeof setMaterialSchema>;
export type AddNoteOp = z.infer<typeof addNoteSchema>;
export type SetCameraOp = z.infer<typeof setCameraSchema>;
export type LoadPackOp = z.infer<typeof loadPackSchema>;
export type SetVisibilityOp = z.infer<typeof setVisibilitySchema>;

export type CoreOp =
  | AddHotspotOp
  | UpdateHotspotOp
  | RemoveHotspotOp
  | SetMaterialOp
  | AddNoteOp
  | SetCameraOp
  | LoadPackOp
  | SetVisibilityOp;

export const CORE_OP_NAMES = [
  "addHotspot",
  "updateHotspot",
  "removeHotspot",
  "setMaterial",
  "addNote",
  "setCamera",
  "loadPack",
  "setVisibility",
] as const;

const nice = (id: unknown): string => String(id ?? "").replace(/[_-]+/g, " ");

/** Op metadata shared by the registry, the parser and the LLM prompt. Schemas live here so the server and client validate identically. */
export interface CoreOpMeta {
  name: (typeof CORE_OP_NAMES)[number];
  schema: z.ZodType<CoreOp>;
  doc: string;
  describe: (op: any) => string;
}

export const coreOpMeta: CoreOpMeta[] = [
  {
    name: "addHotspot",
    schema: addHotspotSchema as z.ZodType<CoreOp>,
    doc: '{"op":"addHotspot","mesh":"<mesh id>","title":"<short title>","body":"<1-3 sentence explanation>"}',
    describe: (o: AddHotspotOp) => `Add hotspot "${o.title}" on ${o.mesh ? nice(o.mesh) : "a point"}`,
  },
  {
    name: "updateHotspot",
    schema: updateHotspotSchema as z.ZodType<CoreOp>,
    doc: '{"op":"updateHotspot","id":"<hotspot id>","title":"<optional>","body":"<optional>"}',
    describe: (o: UpdateHotspotOp) => `Update hotspot ${o.id}`,
  },
  {
    name: "removeHotspot",
    schema: removeHotspotSchema as z.ZodType<CoreOp>,
    doc: '{"op":"removeHotspot","id":"<hotspot id>"}',
    describe: (o: RemoveHotspotOp) => `Remove hotspot ${o.id}`,
  },
  {
    name: "setMaterial",
    schema: setMaterialSchema as z.ZodType<CoreOp>,
    doc: '{"op":"setMaterial","mesh":"<mesh id>","color":"#rrggbb","emissive":"#rrggbb (glow, optional)","roughness":0-1,"metalness":0-1,"opacity":0-1}',
    describe: (o: SetMaterialOp) => {
      const bits: string[] = [];
      if (o.color) bits.push(`color ${o.color}`);
      if (o.emissive) bits.push(`glow ${o.emissive}`);
      if (o.roughness !== undefined) bits.push(`roughness ${o.roughness}`);
      if (o.metalness !== undefined) bits.push(`metalness ${o.metalness}`);
      if (o.opacity !== undefined) bits.push(`opacity ${o.opacity}`);
      return `Change ${nice(o.mesh)}: ${bits.join(", ")}`;
    },
  },
  {
    name: "addNote",
    schema: addNoteSchema as z.ZodType<CoreOp>,
    doc: '{"op":"addNote","mesh":"<mesh id>","text":"<note text>"}',
    describe: (o: AddNoteOp) => `Add note on ${o.mesh ? nice(o.mesh) : "a point"}: "${o.text}"`,
  },
  {
    name: "setCamera",
    schema: setCameraSchema as z.ZodType<CoreOp>,
    doc: '{"op":"setCamera","to":"<camera preset or room id>","mode":"orbit|path (optional)"}',
    describe: (o: SetCameraOp) => `Move camera${o.to ? ` to ${nice(o.to)}` : ""}${o.mode ? ` (${o.mode})` : ""}`,
  },
  {
    name: "loadPack",
    schema: loadPackSchema as z.ZodType<CoreOp>,
    doc: '{"op":"loadPack","pack":"<pack id>"}',
    describe: (o: LoadPackOp) => `Switch to the "${nice(o.pack)}" pack`,
  },
  {
    name: "setVisibility",
    schema: setVisibilitySchema as z.ZodType<CoreOp>,
    doc: '{"op":"setVisibility","mesh":"<mesh id>","visible":true|false}',
    describe: (o: SetVisibilityOp) => `${o.visible ? "Show" : "Hide"} ${nice(o.mesh)}`,
  },
];
