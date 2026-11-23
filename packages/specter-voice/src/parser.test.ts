import { describe, expect, it } from "vitest";
import { parseCommand, splitClauses } from "./parser";
import type { SpecContext } from "./types";

const cell: SpecContext = {
  app: "learnforge",
  meshes: ["nucleus", "mitochondria", "cell_membrane", "golgi_apparatus", "ribosome"],
  hotspots: [{ id: "hs-nucleus", mesh: "nucleus", title: "Nucleus" }],
  packs: ["cell", "solar-system"],
  cameraPresets: ["overview", "nucleus-closeup"],
  aliases: { powerhouse: "mitochondria", membrane: "cell_membrane", golgi: "golgi_apparatus" },
  facts: { DNA: "DNA is the molecule that carries the cell's genetic instructions." },
};

const home: SpecContext = {
  app: "haunthouse-walk",
  meshes: ["sofa", "kitchen_sink", "bed", "dining_table", "lamp"],
  hotspots: [],
  packs: [],
  cameraPresets: ["living-room", "kitchen", "bedroom"],
};

function ops(text: string, ctx: SpecContext) {
  const r = parseCommand(text, ctx);
  return { r, ops: r.spec?.ops ?? [] };
}

describe("parseCommand", () => {
  it("paints a mesh a named color", () => {
    const { ops: o } = ops("Paint the sofa blue", home);
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ op: "setMaterial", mesh: "sofa", color: "#2563eb" });
  });

  it("understands make-the-X-color and hex", () => {
    expect(ops("make the bed red", home).ops[0]).toMatchObject({ mesh: "bed", color: "#dc2626" });
    expect(ops("color the lamp #00ff00", home).ops[0]).toMatchObject({ mesh: "lamp", color: "#00ff00" });
  });

  it("handles modifiers like matte black and glow", () => {
    expect(ops("make the sofa matte black", home).ops[0]).toMatchObject({ mesh: "sofa", color: "#111111", roughness: 0.95 });
    expect(ops("make the mitochondria glow red", cell).ops[0]).toMatchObject({ mesh: "mitochondria", emissive: "#dc2626" });
  });

  it("resolves aliases and fuzzy names", () => {
    expect(ops("paint the powerhouse green", cell).ops[0]).toMatchObject({ mesh: "mitochondria" });
    expect(ops("paint the kitchen sink gold", home).ops[0]).toMatchObject({ mesh: "kitchen_sink" });
    expect(ops("paint the sink gold", home).ops[0]).toMatchObject({ mesh: "kitchen_sink" });
  });

  it("adds a hotspot with a known fact body", () => {
    const o = ops("Add a hotspot on the nucleus about DNA", cell).ops[0] as Record<string, unknown>;
    expect(o.op).toBe("addHotspot");
    expect(o.mesh).toBe("nucleus");
    expect(String(o.body)).toContain("genetic instructions");
  });

  it("adds a hotspot with free text", () => {
    const o = ops("add a hotspot on the ribosome saying it builds proteins", cell).ops[0] as Record<string, unknown>;
    expect(o.mesh).toBe("ribosome");
    expect(String(o.body).toLowerCase()).toContain("builds proteins");
  });

  it("adds a note", () => {
    const o = ops("Add a note on the kitchen sink saying check the drain", home).ops[0] as Record<string, unknown>;
    expect(o).toMatchObject({ op: "addNote", mesh: "kitchen_sink" });
    expect(String(o.text).toLowerCase()).toContain("check the drain");
  });

  it("removes a hotspot by target mesh", () => {
    expect(ops("remove the hotspot on the nucleus", cell).ops[0]).toMatchObject({ op: "removeHotspot", id: "hs-nucleus" });
  });

  it("hides and shows meshes", () => {
    expect(ops("hide the lamp", home).ops[0]).toMatchObject({ op: "setVisibility", mesh: "lamp", visible: false });
    expect(ops("show the lamp", home).ops[0]).toMatchObject({ op: "setVisibility", mesh: "lamp", visible: true });
  });

  it("moves the camera and switches packs", () => {
    expect(ops("go to the kitchen", home).ops[0]).toMatchObject({ op: "setCamera", to: "kitchen" });
    expect(ops("show me the living room", home).ops[0]).toMatchObject({ op: "setCamera", to: "living-room" });
    expect(ops("switch to the solar system", cell).ops[0]).toMatchObject({ op: "loadPack", pack: "solar-system" });
  });

  it("splits compound commands", () => {
    expect(splitClauses("paint the sofa blue and add a note on the lamp saying turn it off").length).toBe(2);
    const { ops: o } = ops("paint the sofa blue and then hide the lamp", home);
    expect(o.map((x) => x.op)).toEqual(["setMaterial", "setVisibility"]);
  });

  it("handles two materials in one clause", () => {
    const { ops: o } = ops("make the sofa red and the bed gold", home);
    expect(o).toHaveLength(2);
    expect(o[1]).toMatchObject({ mesh: "bed" });
  });

  it("fails loudly on unknown targets and never guesses", () => {
    const r = parseCommand("paint the spaceship blue", home);
    expect(r.ok).toBe(false);
    expect(r.spec).toBeUndefined();
    expect(r.errors[0]).toContain("spaceship");
  });

  it("asks for body when a hotspot has none", () => {
    const r = parseCommand("add a hotspot on the nucleus", cell);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain("say");
  });

  it("rejects gibberish", () => {
    const r = parseCommand("flibber the jabberwock", home);
    expect(r.ok).toBe(false);
  });

  it("keeps good clauses when another clause fails", () => {
    const r = parseCommand("paint the sofa blue and hide the spaceship", home);
    expect(r.spec?.ops).toHaveLength(1);
    expect(r.errors).toHaveLength(1);
  });
});
