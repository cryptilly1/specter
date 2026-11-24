import fc from "fast-check";
import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCommandController, parseCommand, type Spec } from "specter-voice";
import { measureScene } from "../budget";
import { createSpecterRegistry } from "../ops";
import { createSpecterScene, type SpecterScene } from "../scene";
import { RECIPES } from "./recipes";
import { createStudioResolver, typicalHeight } from "./resolver";
import { StudioWorld } from "./world";

let scene: SpecterScene;
let world: StudioWorld;
let registry: ReturnType<typeof createSpecterRegistry>;

beforeEach(() => {
  document.body.innerHTML = "";
  scene = createSpecterScene(document.createElement("div"), { headless: true });
  world = new StudioWorld(scene);
  registry = createSpecterRegistry({ studio: world });
});

const resolver = () => createStudioResolver({ scene, fetchImpl: vi.fn(async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 })) as unknown as typeof fetch });

async function run(text: string) {
  const out = parseCommand(text, world.context(), registry);
  if (!out.spec) throw new Error(`parse failed: ${text}: ${out.errors.join(" ")}`);
  const resolved = await resolver().resolve(out.spec);
  const checked = registry.parseSpec(resolved.spec, world.context());
  if (!checked.ok) throw new Error(`invalid after resolve: ${checked.errors.join(" ")}`);
  await registry.apply(scene, checked.spec);
  return checked.spec;
}

function meshCount() {
  let n = 0;
  scene.modelSlot.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) n++;
  });
  return n;
}

describe("recipes", () => {
  for (const r of RECIPES) {
    it(`${r.id}: validates, builds within budget, every hotspot resolves, undo empties the scene`, async () => {
      const spec = await run(`build a ${r.keywords[0]}`);
      expect(world.ids()).toContain(spec.ops.find((o) => o.op === "addObject")!.id);
      expect(measureScene(scene.modelSlot).triangles).toBeLessThan(300_000);
      expect(scene.hotspots.unresolved()).toEqual([]);
      expect(scene.hotspots.list().length).toBeGreaterThan(0);
      await registry.undo();
      expect(world.ids()).toEqual([]);
      expect(scene.hotspots.list()).toEqual([]);
      expect(meshCount()).toBe(0);
    });
  }

  it("building the same recipe twice renames everything instead of clashing", async () => {
    await run("build a solar eclipse");
    await run("build a solar eclipse");
    expect(world.ids()).toEqual(["solar_eclipse", "solar_eclipse_2"]);
    expect(scene.modelSlot.getObjectByName("moon_2")).toBeTruthy();
    expect(new Set(scene.hotspots.list().map((h) => h.id)).size).toBe(scene.hotspots.list().length);
    expect(scene.hotspots.unresolved()).toEqual([]);
  });
});

describe("objects, transforms and copies", () => {
  it("adds shapes, moves, scales, rotates and places on top", async () => {
    await run("add a big blue cube");
    await run("add a red sphere");
    const cube = world.objects.get("cube")!.object;
    const ball = world.objects.get("sphere")!.object;
    expect(ball.position.x).toBeGreaterThan(cube.position.x); // auto-placed beside, not inside
    await run("move the sphere up by 2");
    expect(ball.position.y).toBeCloseTo(2);
    await run("make the sphere twice as big");
    expect(ball.scale.x).toBeCloseTo(2);
    await run("rotate the cube 90 degrees");
    expect(cube.rotation.y).toBeCloseTo(Math.PI / 2);
    await run("put the sphere on the cube");
    const top = new THREE.Box3().setFromObject(cube).max.y;
    expect(new THREE.Box3().setFromObject(ball).min.y).toBeCloseTo(top, 3);
    await registry.undo();
    expect(new THREE.Box3().setFromObject(ball).min.y).not.toBeCloseTo(top, 3);
  });

  it("copies share geometry and deleting a copy leaves the original intact", async () => {
    await run("add a red sphere");
    await run("duplicate the sphere 3 times in a ring");
    expect(world.ids()).toEqual(["sphere", "sphere_2", "sphere_3", "sphere_4"]);
    const origGeo = (world.objects.get("sphere")!.object.children[0] as THREE.Mesh).geometry;
    const spy = vi.spyOn(origGeo, "dispose");
    await run("delete the sphere_3");
    await registry.undo();
    await registry.undo(); // undo the duplicate: copies are freed, the shared geometry is not
    expect(spy).not.toHaveBeenCalled();
    expect(world.ids()).toEqual(["sphere"]);
  });

  it("colour changes on a copy don't leak into the original", async () => {
    await run("add a red sphere");
    await run("duplicate the sphere");
    await run("paint the sphere_2 gold");
    const c = (n: string) => ((scene.modelSlot.getObjectByName(n) as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHexString();
    expect(c("sphere_mesh_2")).toBe("d4a017");
    expect(c("sphere_mesh")).toBe("dc2626");
  });

  it("rejects scenes that would blow the triangle budget and rolls back", async () => {
    await expect(
      registry.apply(scene, {
        version: 1,
        ops: [{ op: "addObject", id: "heavy", source: { type: "composite", parts: Array.from({ length: 60 }, (_, i) => ({ name: `s${i}`, shape: "sphere" as const, dims: { radius: 0.5 } })) } }],
      }),
    ).resolves.toBeUndefined(); // 60 spheres is fine
    const spec: Spec = { version: 1, ops: [] };
    for (let i = 0; i < 12; i++) spec.ops.push({ op: "duplicate", target: "heavy", count: 1, layout: "row" });
    await expect(registry.apply(scene, spec)).rejects.toThrow(/too heavy/);
    expect(world.ids()).toEqual(["heavy"]);
  });

  it("lights get an editor-only bulb that hides in play mode", async () => {
    await run("add a red spot light");
    const bulb = scene.modelSlot.getObjectByName("spot_light_bulb")!;
    expect(bulb.visible).toBe(true);
    world.setMode("play");
    expect(bulb.visible).toBe(false);
  });
});

describe("motion", () => {
  it("orbits, spins, stops, and undo restores the original transform", async () => {
    await run("add a blue sphere");
    await run("add a small grey ball");
    await run("make the ball orbit the sphere");
    const ball = world.objects.get("ball")!.object;
    const start = ball.position.clone();
    for (let i = 0; i < 30; i++) scene.step(0.1);
    expect(ball.position.distanceTo(start)).toBeGreaterThan(0.1);
    const center = world.objects.get("sphere")!.object.position;
    const r0 = Math.hypot(start.x - center.x, start.z - center.z);
    expect(Math.hypot(ball.position.x - center.x, ball.position.z - center.z)).toBeCloseTo(r0, 3);
    await run("stop the ball");
    const stopped = ball.position.clone();
    scene.step(1);
    expect(ball.position.distanceTo(stopped)).toBe(0);
    await registry.undo(); // undo stop
    await registry.undo(); // undo orbit
    expect(ball.position.distanceTo(start)).toBeLessThan(1e-6);
  });

  it("refuses to orbit itself or its own child", async () => {
    await run("build an atom");
    await expect(registry.apply(scene, { version: 1, ops: [{ op: "animate", target: "atom", motion: "orbit", around: "nucleus" }] })).rejects.toThrow(/attached/);
  });
});

describe("interactions", () => {
  it("clicks in play mode run actions; edit mode selects instead", async () => {
    await run("build a solar eclipse");
    await run("when I click the sun, show that it is a star");
    const select = vi.fn();
    world.onSelect = select;
    const sun = scene.modelSlot.getObjectByName("sun")!;
    // edit mode
    (world as unknown as { handlePick(h: THREE.Object3D): boolean }).handlePick(sun);
    expect(select).toHaveBeenCalledWith("solar_eclipse");
    // play mode
    world.setMode("play");
    (world as unknown as { handlePick(h: THREE.Object3D): boolean }).handlePick(sun);
    const panel = scene.container.querySelector(".specter-panel") as HTMLElement;
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain("It is a star.");
  });

  it("toggle visibility and highlight actions are reversible", async () => {
    await run("add a red cube");
    await run("add a blue sphere");
    await run("when I click the cube hide the sphere");
    world.setMode("play");
    world.run("cube", world.interactionsOf("cube").click!);
    expect(world.objects.get("sphere")!.object.visible).toBe(false);
    world.run("cube", world.interactionsOf("cube").click!);
    expect(world.objects.get("sphere")!.object.visible).toBe(true);
    world.run("sphere", { type: "highlight", color: "#ffff00" });
    const m = scene.modelSlot.getObjectByName("sphere_mesh") as THREE.Mesh;
    expect((m.material as THREE.MeshStandardMaterial).emissive.getHexString()).toBe("ffff00");
    world.setMode("edit");
    expect((m.material as THREE.MeshStandardMaterial).emissive.getHexString()).not.toBe("ffff00");
  });
});

describe("environment", () => {
  it("presets switch lighting and ground, and undo restores", async () => {
    await run("make it space");
    expect(world.environment).toBe("space");
    expect(world.groundVisible).toBe(false);
    await registry.undo();
    expect(world.environment).toBe("studio");
    expect(world.groundVisible).toBe(true);
  });
});

describe("resolver", () => {
  const candidate = (id: string, title: string, host = "static.poly.pizza") => ({
    provider: "polypizza",
    assetId: id,
    title,
    url: `https://${host}/${id}.glb`,
    license: { id: "CC-BY-4.0", label: "CC BY 4.0", attributionRequired: true },
    credit: `"${title}" by someone (poly.pizza) CC BY 4.0`,
    sourceUrl: `https://poly.pizza/m/${id}`,
    platformCredit: { text: "Models provided by Poly Pizza", url: "https://poly.pizza" },
    thumbnail: `https://static.poly.pizza/${id}.webp`,
  });

  it("turns a search into a licensed asset with choices and a sensible height", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ candidates: [candidate("a", "Oak tree"), candidate("b", "Pine tree")] })));
    const r = createStudioResolver({ scene, fetchImpl: f as unknown as typeof fetch });
    const parsed = parseCommand("add a tree", world.context(), registry);
    const res = await r.resolve(parsed.spec!);
    expect(res.spec.ops[0]).toMatchObject({ op: "addObject", height: 4, source: { type: "asset", provider: "polypizza", assetId: "a" } });
    expect(res.choices?.[0]?.options.map((o) => o.label)).toEqual(["Oak tree", "Pine tree"]);
    expect(registry.parseSpec(res.spec, world.context()).ok).toBe(true);
  });

  it("the controller re-validates resolver output, so a bad URL from the server is refused", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ candidates: [candidate("x", "Tree", "evil.example")] })));
    const r = createStudioResolver({ scene, fetchImpl: f as unknown as typeof fetch });
    const c = createCommandController({ registry, ctx: scene, getContext: () => world.context(), interpretOptions: { localOnly: true }, resolve: r.resolve });
    await c.submit("add a tree");
    expect(c.getState().pending).toBeNull();
    expect(c.getState().errors.join(" ")).toMatch(/allowed library/);
  });

  it("explains when nothing is found and when search is down", async () => {
    const r1 = createStudioResolver({ scene, fetchImpl: vi.fn(async () => new Response(JSON.stringify({ candidates: [] }))) as unknown as typeof fetch });
    const res1 = await r1.resolve(parseCommand("add a zorblax", world.context(), registry).spec!);
    expect(res1.spec.ops).toEqual([]);
    expect(res1.errors?.[0]).toContain("zorblax");
    const r2 = createStudioResolver({
      scene,
      fetchImpl: vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });
    const res2 = await r2.resolve(parseCommand("add a lantern", world.context(), registry).spec!);
    expect(res2.errors?.[0]).toMatch(/unreachable/);
  });

  it("starts generation jobs and hands them to the app", async () => {
    const onGenerate = vi.fn();
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, job: { id: "job-12345678", stage: "preview" } })));
    const r = createStudioResolver({ scene, fetchImpl: f as unknown as typeof fetch, onGenerate });
    const parsed = parseCommand("generate a stone gargoyle", world.context({ generate: true }), registry);
    const res = await r.resolve(parsed.spec!);
    expect(res.spec.ops).toEqual([]);
    expect(res.notices?.[0]).toContain("Meshy");
    expect(onGenerate).toHaveBeenCalledWith({ id: "job-12345678", stage: "preview" }, expect.objectContaining({ op: "addObject" }));
  });

  it("typical heights", () => {
    expect(typicalHeight("oak tree")).toBe(4);
    expect(typicalHeight("office chair")).toBe(0.95);
    expect(typicalHeight("zorblax")).toBe(1);
  });
});

describe("PBT: random studio sessions", () => {
  it("any sequence of commands applies or fails atomically, and undoing everything leaves an empty scene", async () => {
    const commands = [
      "add a red cube",
      "add a blue sphere",
      "add a big green cone",
      "build an atom",
      "build a house",
      "move the cube left by 2",
      "make the sphere bigger",
      "rotate the cone 45 degrees",
      "duplicate the cube 2 times in a ring",
      "make the sphere spin",
      "make the cube orbit the sphere",
      "put the sphere on the cube",
      "delete the cone",
      "paint the cube gold",
      "when I click the sphere, show that it is round",
      "make it night",
      "add a point light",
      "stop everything",
    ];
    await fc.assert(
      fc.asyncProperty(fc.array(fc.constantFrom(...commands), { minLength: 1, maxLength: 10 }), async (seq) => {
        document.body.innerHTML = "";
        const s = createSpecterScene(document.createElement("div"), { headless: true });
        const w = new StudioWorld(s);
        const reg = createSpecterRegistry({ studio: w });
        const r = createStudioResolver({ scene: s, fetchImpl: vi.fn() as unknown as typeof fetch });
        let applied = 0;
        for (const text of seq) {
          const parsed = parseCommand(text, w.context(), reg);
          if (!parsed.spec) continue; // e.g. "move the cube" before a cube exists: refused, nothing changes
          const res = await r.resolve(parsed.spec);
          const checked = reg.parseSpec(res.spec, w.context());
          if (!checked.ok) continue;
          const before = w.ids().join(",");
          try {
            await reg.apply(s, checked.spec);
            applied++;
          } catch {
            expect(w.ids().join(",")).toBe(before); // atomic
          }
          s.step(0.1);
        }
        for (let i = 0; i < applied; i++) await reg.undo();
        expect(w.ids()).toEqual([]);
        let meshes = 0;
        s.modelSlot.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) meshes++;
        });
        expect(meshes).toBe(0);
        expect(s.hotspots.list()).toEqual([]);
        w.destroy();
        s.destroy();
      }),
      { numRuns: 40 },
    );
  }, 120000);
});

describe("placement and sizing fixes (from live AI testing)", () => {
  it("a requested position inside another object is replaced by a free spot", async () => {
    await run("add a big blue cube");
    await registry.apply(scene, { version: 1, ops: [{ op: "addObject", id: "ball", source: { type: "primitive", part: { name: "ball_mesh", shape: "sphere", dims: { radius: 0.5 } } }, position: [0, 0, 0] }] });
    const cube = new THREE.Box3().setFromObject(world.objects.get("cube")!.object);
    const ball = new THREE.Box3().setFromObject(world.objects.get("ball")!.object);
    expect(cube.intersectsBox(ball.expandByScalar(-0.05))).toBe(false);
  });

  it("size words scale library models", async () => {
    const c = { provider: "polypizza", assetId: "b", title: "Barn", url: "https://static.poly.pizza/b.glb", license: { id: "CC0-1.0", label: "CC0", attributionRequired: false }, credit: "Barn", sourceUrl: "https://poly.pizza/m/b" };
    const r = createStudioResolver({ scene, fetchImpl: vi.fn(async () => new Response(JSON.stringify({ candidates: [c] }))) as unknown as typeof fetch });
    const small = await r.resolve({ version: 1, ops: [{ op: "addObject", id: "small_red_barn", source: { type: "search", query: "barn" } }] }, "add a small red barn");
    expect(small.spec.ops[0]).toMatchObject({ height: 2 });
    const big = await r.resolve({ version: 1, ops: [{ op: "addObject", id: "barn", source: { type: "search", query: "barn" } }] }, "add a huge barn");
    expect(big.spec.ops[0]).toMatchObject({ height: 10 });
  });
});
