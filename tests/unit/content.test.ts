import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createSpecterRegistry, createSpecterScene, validatePath, type SpecterScene } from "../../packages/specter-core/src";
import { parseCommand, type SpecContext } from "../../packages/specter-voice/src";
import { PACK_IDS, PACKS } from "../../apps/learnforge/src/packs";
import { buildApartment, TOUR } from "../../apps/haunthouse-walk/src/apartment";
import { ALIASES as WALK_ALIASES, CHIPS as WALK_CHIPS, FACTS as WALK_FACTS, HOTSPOTS as WALK_HOTSPOTS } from "../../apps/haunthouse-walk/src/content";
import { ALIASES as FORGE_ALIASES, CHIPS as FORGE_CHIPS, FACTS as FORGE_FACTS, HOTSPOTS as FORGE_HOTSPOTS, VIEWS as FORGE_VIEWS, buildLantern } from "../../apps/crypt-forge/src/lantern";

/**
 * Content integrity: every hotspot target resolves, every demo chip parses and applies, every tour is valid.
 * This is what keeps the recorded demo from breaking when someone edits packs or content.
 */

function newScene(model: THREE.Object3D): SpecterScene {
  const s = createSpecterScene(document.createElement("div"), { headless: true });
  s.setModel(model, { fit: false });
  return s;
}

async function checkChips(scene: SpecterScene, chips: { label: string; text: string }[], ctx: SpecContext, label: string) {
  const registry = createSpecterRegistry({ loadPack: () => undefined });
  expect(chips.length, `${label} has chips`).toBeGreaterThan(0);
  for (const chip of chips) {
    const out = parseCommand(chip.text, ctx, registry);
    expect(out.errors, `${label} chip "${chip.text}" should parse cleanly`).toEqual([]);
    expect(out.spec, `${label} chip "${chip.text}" should produce a spec`).toBeDefined();
    await registry.apply(scene, out.spec!);
    await registry.undo();
  }
}

describe("LearnForge packs", () => {
  for (const pack of PACKS) {
    it(`${pack.id}: hotspots resolve, views are sane, chips work`, async () => {
      const scene = newScene(pack.build());
      scene.registerCameraPresets(pack.views);
      expect(pack.views.overview).toBeDefined();

      const ids = new Set<string>();
      for (const h of pack.hotspots) {
        expect(ids.has(h.id), `duplicate hotspot id ${h.id}`).toBe(false);
        ids.add(h.id);
        expect(h.title.trim().length).toBeGreaterThan(0);
        expect(h.body.trim().length).toBeGreaterThan(20);
        expect(() => scene.hotspots.add({ ...h, kind: "hotspot" }), `${pack.id}: hotspot ${h.id} -> ${h.mesh}`).not.toThrow();
      }
      for (const alias of Object.values(pack.aliases)) {
        expect(scene.modelSlot.getObjectByName(alias), `${pack.id}: alias target ${alias}`).toBeTruthy();
      }
      const ctx = scene.getSpecContext({ app: "learnforge", packs: PACK_IDS, aliases: pack.aliases, facts: pack.facts });
      await checkChips(scene, pack.chips, ctx, pack.id);
      scene.destroy();
    });
  }
});

describe("HauntHouse Walk", () => {
  it("hotspots resolve and the tour is a valid, ordered path", () => {
    const scene = newScene(buildApartment());
    for (const h of WALK_HOTSPOTS) expect(() => scene.hotspots.add({ ...h, kind: "hotspot" }), h.id).not.toThrow();
    for (const target of Object.values(WALK_ALIASES)) expect(scene.modelSlot.getObjectByName(target), `alias target ${target}`).toBeTruthy();
    const frames = TOUR.map((k) => ({ id: k.id, t: k.t, position: [...k.position] as [number, number, number], target: [...k.target] as [number, number, number] }));
    expect(() => validatePath(frames)).not.toThrow();
    scene.destroy();
  });

  it("every demo chip parses and applies, and every room can be reached by voice", async () => {
    const scene = newScene(buildApartment());
    scene.registerCameraPresets(Object.fromEntries(TOUR.map((k) => [k.id, { position: [...k.position], target: [...k.target] }])) as never);
    const ctx = scene.getSpecContext({ app: "haunthouse-walk", aliases: WALK_ALIASES, facts: WALK_FACTS });
    await checkChips(scene, WALK_CHIPS, ctx, "walk");
    for (const k of TOUR.slice(1)) {
      const out = parseCommand(`go to the ${k.label.toLowerCase()}`, ctx);
      expect(out.spec?.ops[0], `go to ${k.label}`).toMatchObject({ op: "setCamera", to: k.id });
    }
    scene.destroy();
  });

  it("the headline commands from the demo script work", async () => {
    const scene = newScene(buildApartment());
    const registry = createSpecterRegistry();
    const ctx = scene.getSpecContext({ app: "haunthouse-walk", aliases: WALK_ALIASES });
    for (const text of ["Paint the sofa blue", "Add a note on the kitchen sink", "paint the couch red", "make the bed gold and hide the plant", "paint the walls teal"]) {
      const out = parseCommand(text === "Add a note on the kitchen sink" ? `${text} saying check the drain` : text, ctx, registry);
      expect(out.spec, text).toBeDefined();
      await registry.apply(scene, out.spec!);
    }
    scene.destroy();
  });
});

describe("Crypt Forge", () => {
  it("hotspots resolve, chips apply and the configurator parts exist", async () => {
    const scene = newScene(buildLantern());
    scene.registerCameraPresets(FORGE_VIEWS);
    for (const h of FORGE_HOTSPOTS) expect(() => scene.hotspots.add({ ...h, kind: "hotspot" }), h.id).not.toThrow();
    for (const part of ["frame", "cap", "base", "handle_ring", "handle_hook", "glass", "flame", "candle"]) {
      expect(scene.modelSlot.getObjectByName(part), `part ${part}`).toBeTruthy();
    }
    for (const target of Object.values(FORGE_ALIASES)) expect(scene.modelSlot.getObjectByName(target), `alias target ${target}`).toBeTruthy();
    const ctx = scene.getSpecContext({ app: "crypt-forge", aliases: FORGE_ALIASES, facts: FORGE_FACTS });
    await checkChips(scene, FORGE_CHIPS, ctx, "forge");
    scene.destroy();
  });
});
