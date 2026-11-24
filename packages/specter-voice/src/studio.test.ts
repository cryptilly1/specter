import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseCommand } from "./parser";
import { OpRegistry } from "./registry";
import type { SpecContext } from "./types";

const registry = new OpRegistry({ includeStudio: true });

const empty: SpecContext = {
  app: "studio",
  meshes: [],
  hotspots: [],
  packs: [],
  cameraPresets: [],
  objects: [],
  libraries: true,
  generate: false,
  recipes: [
    { id: "solar-eclipse", title: "Solar eclipse", keywords: ["eclipse", "solar eclipse"] },
    { id: "water-cycle", title: "Water cycle", keywords: ["water cycle", "rain cycle"] },
    { id: "atom", title: "Atom", keywords: ["atom", "bohr model"] },
  ],
};

const scene: SpecContext = {
  ...empty,
  meshes: ["sun", "moon", "earth", "table", "table_top", "lantern"],
  objects: ["sun", "moon", "earth", "table", "lantern"],
};

const ops = (text: string, ctx = scene) => {
  const r = parseCommand(text, ctx, registry);
  return { r, ops: r.spec?.ops ?? [] };
};

describe("studio parser: building", () => {
  it("builds a recipe from an empty scene", () => {
    for (const t of ["Build a solar eclipse", "show me the water cycle", "make an atom", "I want to see a solar eclipse"]) {
      const { ops: o, r } = ops(t, empty);
      expect(r.errors, t).toEqual([]);
      expect(o[0], t).toMatchObject({ op: "addObject", source: { type: "recipe" } });
    }
  });

  it("adds shapes with colour and size", () => {
    expect(ops("add a red sphere", empty).ops[0]).toMatchObject({ op: "addObject", source: { type: "primitive", part: { shape: "sphere", color: "#dc2626" } } });
    const big = ops("add a big blue cube", empty).ops[0] as any;
    expect(big.source.part.shape).toBe("box");
    expect(big.source.part.dims.width).toBeCloseTo(1.8);
    expect(ops("add a glowing yellow ball", empty).ops[0]).toMatchObject({ source: { part: { emissive: "#facc15" } } });
  });

  it("searches free libraries for real-world things", () => {
    expect(ops("add a lantern", empty).ops[0]).toMatchObject({ op: "addObject", id: "lantern", source: { type: "search", query: "lantern" } });
    expect(ops("add a triceratops", empty).ops[0]).toMatchObject({ source: { type: "search", query: "triceratops" } });
    expect(ops("add an old wooden chair", empty).ops[0]).toMatchObject({ source: { type: "search", query: "old wooden chair" } });
  });

  it("places on other objects and makes copies", () => {
    expect(ops("put a lantern on the table").ops[0]).toMatchObject({ op: "addObject", on: "table" });
    const five = ops("add five trees in a ring", empty).ops;
    expect(five.map((o) => o.op)).toEqual(["addObject", "duplicate"]);
    expect(five[1]).toMatchObject({ count: 4, layout: "ring", target: "tree" });
  });

  it("adds lights and labels", () => {
    expect(ops("add a red spot light", empty).ops[0]).toMatchObject({ op: "addLight", kind: "spot", color: "#dc2626" });
    expect(ops("add a label saying Hello class", empty).ops[0]).toMatchObject({ source: { part: { shape: "label", text: "Hello class" } } });
  });

  it("generation needs a key", () => {
    expect(ops("generate a stone gargoyle", empty).r.ok).toBe(false);
    expect(ops("generate a stone gargoyle", { ...empty, generate: true }).ops[0]).toMatchObject({ source: { type: "generate", prompt: "stone gargoyle" } });
  });

  it("renames ids that already exist instead of clashing", () => {
    expect(ops("add a lantern").ops[0]).toMatchObject({ id: "lantern_2" });
  });
});

describe("studio parser: editing", () => {
  it("moves, scales, rotates, places", () => {
    expect(ops("move the moon left by 2").ops[0]).toMatchObject({ op: "transform", target: "moon", move: [-2, 0, 0] });
    expect(ops("move the lantern up a bit").ops[0]).toMatchObject({ move: [0, 0.4, 0] });
    expect(ops("make the sun bigger").ops[0]).toMatchObject({ op: "transform", target: "sun", scaleBy: 1.5 });
    expect(ops("make the earth twice as big").ops[0]).toMatchObject({ scaleBy: 2 });
    expect(ops("make the moon 3 times smaller").ops[0]).toMatchObject({ scaleBy: 0.333 });
    expect(ops("rotate the table 45 degrees").ops[0]).toMatchObject({ op: "transform", rotateBy: [0, 45, 0] });
    expect(ops("flip the lantern upside down").ops[0]).toMatchObject({ rotateBy: [180, 0, 0] });
    expect(ops("put the lantern on the table").ops[0]).toMatchObject({ op: "transform", target: "lantern", on: "table" });
  });

  it("animates", () => {
    expect(ops("make the moon orbit the earth").ops[0]).toMatchObject({ op: "animate", target: "moon", motion: "orbit", around: "earth" });
    expect(ops("make the earth spin slowly").ops[0]).toMatchObject({ motion: "spin", speed: 0.4 });
    expect(ops("spin the sun").ops[0]).toMatchObject({ motion: "spin", target: "sun" });
    expect(ops("make the lantern float").ops[0]).toMatchObject({ motion: "bob" });
    expect(ops("stop the moon").ops[0]).toMatchObject({ motion: "stop" });
    expect(ops("stop everything").ops).toHaveLength(5);
    expect(ops("make the moon orbit").r.ok).toBe(false);
  });

  it("adds interactions", () => {
    const o = ops("when I click the sun, show that it is a star and it is very hot").ops[0] as any;
    expect(o).toMatchObject({ op: "addInteraction", target: "sun", trigger: "click", action: { type: "showInfo" } });
    expect(o.action.body).toBe("It is a star and it is very hot.");
    expect(ops("when someone hovers over the moon highlight it in blue").ops[0]).toMatchObject({ trigger: "hover", action: { type: "highlight", color: "#2563eb" } });
    expect(ops("when I click the earth, zoom in").ops[0]).toMatchObject({ action: { type: "focus" } });
    expect(ops("when I tap the lantern hide the table").ops[0]).toMatchObject({ action: { type: "toggleVisibility", target: "table" } });
  });

  it("removes and duplicates", () => {
    expect(ops("delete the lantern").ops[0]).toMatchObject({ op: "removeObject", id: "lantern" });
    expect(ops("remove everything").ops).toHaveLength(5);
    expect(ops("duplicate the lantern 3 times in a row").ops[0]).toMatchObject({ op: "duplicate", count: 3, layout: "row" });
    expect(ops("make 6 copies of the moon in a ring").ops[0]).toMatchObject({ count: 6, layout: "ring" });
  });

  it("changes the environment", () => {
    expect(ops("set the background to night").ops[0]).toMatchObject({ op: "setEnvironment", preset: "night" });
    expect(ops("make it space").ops[0]).toMatchObject({ preset: "space" });
    expect(ops("remove the floor").ops[0]).toMatchObject({ ground: false });
  });

  it("still handles paint and hotspots in studio mode", () => {
    expect(ops("paint the moon gold").ops[0]).toMatchObject({ op: "setMaterial", mesh: "moon" });
    expect(ops("add a hotspot on the sun about gravity").ops[0]).toMatchObject({ op: "addHotspot", mesh: "sun" });
    expect(ops("build a solar eclipse and make the sun spin").ops.map((x) => x.op)).toEqual(["addObject", "animate"]);
  });

  it("fails loudly on unknown objects", () => {
    const r = parseCommand("move the spaceship left", scene, registry);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain("spaceship");
  });
});

describe("registry: studio validation", () => {
  it("lets later ops refer to names created earlier in the same spec", () => {
    const res = registry.parseSpec(
      {
        ops: [
          { op: "addObject", id: "snowman", source: { type: "composite", parts: [{ name: "body", shape: "sphere" }, { name: "head", shape: "sphere", parent: "body" }] } },
          { op: "animate", target: "head", motion: "bob" },
          { op: "setMaterial", mesh: "body", color: "#ffffff" },
          { op: "addInteraction", target: "snowman", trigger: "click", action: { type: "toggleVisibility", target: "head" } },
        ],
      },
      empty,
    );
    expect(res.ok).toBe(true);
  });

  it("renames clashing ids and parts, and rewrites later references", () => {
    const res = registry.parseSpec(
      { ops: [{ op: "addObject", id: "moon", source: { type: "composite", parts: [{ name: "earth", shape: "sphere" }] } }, { op: "animate", target: "earth", motion: "spin" }] },
      scene,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.spec.ops[0]).toMatchObject({ id: "moon_2", source: { parts: [{ name: "earth_2" }] } });
    expect(res.spec.ops[1]).toMatchObject({ target: "earth_2" });
  });

  it("rejects model URLs outside the allowed libraries", () => {
    const asset = (url: string) => ({
      op: "addObject",
      id: "thing",
      source: { type: "asset", provider: "polypizza", assetId: "x", title: "X", url, license: { id: "CC0-1.0", label: "CC0", attributionRequired: false }, credit: "c", sourceUrl: "https://poly.pizza/m/x" },
    });
    expect(registry.parseSpec({ ops: [asset("https://evil.example/x.glb")] }, empty).ok).toBe(false);
    expect(registry.parseSpec({ ops: [asset("https://static.poly.pizza/x.glb")] }, empty).ok).toBe(true);
  });

  it("rejects duplicate part names, unknown parents and unknown targets", () => {
    expect(registry.parseSpec({ ops: [{ op: "addObject", id: "a", source: { type: "composite", parts: [{ name: "p", shape: "box" }, { name: "p", shape: "box" }] } }] }, empty).ok).toBe(false);
    expect(registry.parseSpec({ ops: [{ op: "addObject", id: "a", source: { type: "composite", parts: [{ name: "p", shape: "box", parent: "nope" }] } }] }, empty).ok).toBe(false);
    expect(registry.parseSpec({ ops: [{ op: "animate", target: "ghost", motion: "spin" }] }, scene).ok).toBe(false);
    expect(registry.parseSpec({ ops: [{ op: "animate", target: "moon", motion: "orbit", around: "ghost" }] }, scene).ok).toBe(false);
  });

  it("PBT: random studio specs either validate or are rejected, never crash, and never reference missing names", () => {
    const nameArb = fc.constantFrom("sun", "moon", "earth", "ghost", "new_thing", "lantern");
    const opArb = fc.oneof(
      fc.record({ op: fc.constant("transform"), target: nameArb, move: fc.tuple(fc.double({ min: -5, max: 5, noNaN: true }), fc.constant(0), fc.constant(0)) }),
      fc.record({ op: fc.constant("animate"), target: nameArb, motion: fc.constantFrom("spin", "orbit", "bob", "stop"), around: nameArb }),
      fc.record({ op: fc.constant("addObject"), id: nameArb, source: fc.constant({ type: "primitive", part: { name: "part", shape: "box" } }) }),
      fc.record({ op: fc.constant("removeObject"), id: nameArb }),
    );
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 8 }), (list) => {
        const res = registry.parseSpec({ version: 1, ops: list }, scene);
        if (!res.ok) return;
        const known = new Set(scene.meshes);
        for (const op of res.spec.ops) {
          for (const f of ["target", "around"]) if (typeof op[f] === "string") expect(known.has(op[f] as string), `${op.op}.${f}=${op[f]}`).toBe(true);
          if (op.op === "removeObject") expect(known.has(op.id as string)).toBe(true);
          if (op.op === "addObject") {
            expect(known.has(op.id as string)).toBe(false);
            known.add(op.id as string);
            known.add(((op.source as any).part as { name: string }).name);
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});
