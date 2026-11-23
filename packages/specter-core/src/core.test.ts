import fc from "fast-check";
import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCommandController } from "specter-voice";
import { checkBudget, measureScene } from "./budget";
import { CameraPath, PathPlayer, validatePath, type Keyframe } from "./camera-path";
import { disposeObject3D } from "./dispose";
import { InvalidPathError, TargetNotFoundError } from "./errors";
import { listTargets } from "./find";
import { createSpecterRegistry } from "./ops";
import { namedGroup, namedMesh, pbr } from "./procedural";
import { createSpecterScene, SpecterScene } from "./scene";

function room(): THREE.Group {
  const shared = pbr("#888888");
  const g = new THREE.Group();
  g.name = "room";
  g.add(namedMesh("sofa", new THREE.BoxGeometry(2, 1, 1), shared, [0, 0.5, 0]));
  g.add(namedMesh("bed", new THREE.BoxGeometry(2, 0.6, 2), shared, [4, 0.3, 0]));
  g.add(namedMesh("lamp", new THREE.CylinderGeometry(0.2, 0.2, 1.5), pbr("#ffeeaa"), [-3, 0.75, 0]));
  g.add(namedGroup("kitchen_sink", [namedMesh("basin", new THREE.BoxGeometry(1, 0.2, 1), pbr("#cccccc"))], [0, 0, -4]));
  return g;
}

let container: HTMLElement;
let scene: SpecterScene;

beforeEach(() => {
  document.body.innerHTML = "";
  container = document.createElement("div");
  document.body.appendChild(container);
  scene = createSpecterScene(container, { headless: true });
  scene.setModel(room());
});

describe("hotspots", () => {
  it("requires title, body and a resolvable target", () => {
    expect(() => scene.hotspots.add({ id: "a", mesh: "nope", title: "T", body: "B" })).toThrow(TargetNotFoundError);
    expect(() => scene.hotspots.add({ id: "a", mesh: "sofa", title: "", body: "B" })).toThrow();
    expect(() => scene.hotspots.add({ id: "a", mesh: "sofa", title: "T", body: "  " })).toThrow();
    expect(() => scene.hotspots.add({ id: "a", title: "T", body: "B" })).toThrow(TargetNotFoundError);
    expect(scene.hotspots.list()).toHaveLength(0);
  });

  it("creates an accessible marker and opens the panel", () => {
    scene.hotspots.add({ id: "s", mesh: "sofa", title: "Sofa", body: "Comfy." });
    const marker = container.querySelector<HTMLButtonElement>(".specter-marker")!;
    expect(marker.getAttribute("aria-label")).toContain("Sofa");
    marker.click();
    const panel = container.querySelector<HTMLElement>(".specter-panel")!;
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain("Comfy.");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(panel.hidden).toBe(true);
  });

  it("renders text safely (no HTML injection)", () => {
    scene.hotspots.add({ id: "x", mesh: "sofa", title: "<img src=x onerror=alert(1)>", body: "<script>alert(1)</script>" });
    scene.hotspots.select("x");
    expect(container.querySelector(".specter-panel img")).toBeNull();
    expect(container.querySelector(".specter-panel script")).toBeNull();
  });

  // P1
  it("PBT: every hotspot target resolves or fails loudly", () => {
    const known = listTargets(scene.modelSlot);
    fc.assert(
      fc.property(fc.oneof(fc.constantFrom(...known), fc.string({ minLength: 1, maxLength: 10 })), (mesh) => {
        const s = createSpecterScene(document.createElement("div"), { headless: true });
        s.setModel(room());
        const resolvable = known.includes(mesh) || known.some((k) => k.toLowerCase() === mesh.toLowerCase());
        try {
          s.hotspots.add({ id: "h", mesh, title: "t", body: "b" });
          expect(resolvable || s.modelSlot.getObjectByName(mesh) !== undefined).toBe(true);
        } catch (e) {
          expect(e).toBeInstanceOf(TargetNotFoundError);
        } finally {
          s.destroy();
        }
      }),
      { numRuns: 60 },
    );
  });
});

describe("materials", () => {
  const colorOf = (name: string) => ((scene.modelSlot.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHexString();

  // P2
  it("only changes the named mesh even when the material is shared", () => {
    const beforeBed = colorOf("bed");
    scene.materials.set("sofa", { color: "#ff0000" });
    expect(colorOf("sofa")).toBe("ff0000");
    expect(colorOf("bed")).toBe(beforeBed);
  });

  it("changes every mesh inside a named group", () => {
    scene.materials.set("kitchen_sink", { color: "#00ff00" });
    expect(colorOf("basin")).toBe("00ff00");
  });

  it("undo restores the original material", () => {
    const before = colorOf("sofa");
    const { undo } = scene.materials.set("sofa", { color: "#123456" });
    undo();
    expect(colorOf("sofa")).toBe(before);
  });

  it("throws for unknown meshes", () => {
    expect(() => scene.materials.set("spaceship", { color: "#fff" })).toThrow(TargetNotFoundError);
  });

  it("PBT: random patches never change meshes that were not named", () => {
    fc.assert(
      fc.property(fc.constantFrom("sofa", "bed", "lamp"), fc.integer({ min: 0, max: 0xffffff }), (target, n) => {
        const s = createSpecterScene(document.createElement("div"), { headless: true });
        s.setModel(room());
        const get = (name: string) => ((s.modelSlot.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHexString();
        const others = ["sofa", "bed", "lamp"].filter((x) => x !== target);
        const before = others.map(get);
        s.materials.set(target, { color: "#" + n.toString(16).padStart(6, "0") });
        expect(others.map(get)).toEqual(before);
        s.destroy();
      }),
      { numRuns: 40 },
    );
  });
});

describe("dispose", () => {
  // P6
  it("destroy() disposes geometries and materials", () => {
    const geoSpies: ReturnType<typeof vi.spyOn>[] = [];
    const matSpies: ReturnType<typeof vi.spyOn>[] = [];
    scene.modelSlot.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        geoSpies.push(vi.spyOn(m.geometry, "dispose"));
        matSpies.push(vi.spyOn(m.material as THREE.Material, "dispose"));
      }
    });
    scene.destroy();
    expect(geoSpies.length).toBeGreaterThan(0);
    geoSpies.forEach((s) => expect(s).toHaveBeenCalled());
    matSpies.forEach((s) => expect(s).toHaveBeenCalled());
  });

  it("disposes textures and is safe to call twice", () => {
    const tex = new THREE.Texture();
    const spy = vi.spyOn(tex, "dispose");
    const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: tex }));
    const stats = disposeObject3D(m);
    expect(spy).toHaveBeenCalled();
    expect(stats.textures).toBe(1);
    expect(() => disposeObject3D(m)).not.toThrow();
  });

  it("swapping the model disposes the old one and keeps hotspots resolvable", () => {
    const old = scene.modelSlot.children[0]!;
    const spies: ReturnType<typeof vi.spyOn>[] = [];
    old.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) spies.push(vi.spyOn((o as THREE.Mesh).geometry, "dispose"));
    });
    scene.hotspots.add({ id: "s", mesh: "sofa", title: "Sofa", body: "x" });
    scene.setModel(room());
    spies.forEach((s) => expect(s).toHaveBeenCalled());
    expect(scene.hotspots.unresolved()).toEqual([]);
  });

  it("restored (undone) material swaps leave nothing undisposed", async () => {
    const reg = createSpecterRegistry();
    await reg.apply(scene, { version: 1, ops: [{ op: "setMaterial", mesh: "sofa", color: "#ff00ff" }] });
    await reg.undo();
    expect(() => scene.destroy()).not.toThrow();
  });
});

describe("registry bound to the scene", () => {
  it("applies hotspot, note, material and visibility ops and undoes them", async () => {
    const reg = createSpecterRegistry();
    const ctrl = createCommandController({ registry: reg, ctx: scene, getContext: () => scene.getSpecContext({ app: "t" }), interpretOptions: { localOnly: true } });
    await ctrl.submit("add a hotspot on the sofa saying best seat in the house and hide the lamp and add a note on the bed saying change the sheets");
    expect(ctrl.getState().pending?.spec.ops).toHaveLength(3);
    await ctrl.confirm();
    expect(scene.hotspots.list().map((h) => h.kind).sort()).toEqual(["hotspot", "note"]);
    expect(scene.modelSlot.getObjectByName("lamp")!.visible).toBe(false);
    await ctrl.undo();
    expect(scene.hotspots.list()).toHaveLength(0);
    expect(scene.modelSlot.getObjectByName("lamp")!.visible).toBe(true);
  });

  it("applying the same spec twice yields one hotspot (idempotent)", async () => {
    const reg = createSpecterRegistry();
    const spec = { version: 1 as const, ops: [{ op: "addHotspot", id: "h1", mesh: "sofa", title: "Sofa", body: "Soft." }] };
    await reg.apply(scene, spec);
    await reg.apply(scene, spec);
    expect(scene.hotspots.list()).toHaveLength(1);
  });

  it("rolls back when a later op fails", async () => {
    const reg = createSpecterRegistry();
    await expect(
      reg.apply(scene, {
        version: 1,
        ops: [
          { op: "addHotspot", id: "h1", mesh: "sofa", title: "Sofa", body: "Soft." },
          { op: "setMaterial", mesh: "spaceship", color: "#ffffff" },
        ],
      }),
    ).rejects.toThrow();
    expect(scene.hotspots.list()).toHaveLength(0);
  });

  it("loadPack needs a hook", async () => {
    const reg = createSpecterRegistry();
    await expect(reg.apply(scene, { version: 1, ops: [{ op: "loadPack", pack: "x" }] })).rejects.toThrow(/no content packs/);
    const calls: string[] = [];
    const reg2 = createSpecterRegistry({ loadPack: (p) => void calls.push(p) });
    await reg2.apply(scene, { version: 1, ops: [{ op: "loadPack", pack: "x" }] });
    expect(calls).toEqual(["x"]);
  });

  it("camera ops go to presets and keyframes, unknown targets fail", async () => {
    scene.registerCameraPresets({ kitchen: { position: [0, 2, -8], target: [0, 1, -4] } });
    const reg = createSpecterRegistry();
    await reg.apply(scene, { version: 1, ops: [{ op: "setCamera", to: "kitchen" }] });
    expect(scene.camera.position.z).toBeCloseTo(-8);
    await expect(reg.apply(scene, { version: 1, ops: [{ op: "setCamera", to: "attic" }] })).rejects.toThrow(/Could not find camera "attic"/);
  });
});

describe("camera paths", () => {
  const kf = (t: number): Keyframe => ({ t, position: [t, 1, 3], target: [0, 1, 0] });

  it("rejects short, non-increasing, duplicate and non-finite paths", () => {
    expect(() => validatePath([kf(0)])).toThrow(InvalidPathError);
    expect(() => validatePath([kf(0), kf(0)])).toThrow(InvalidPathError);
    expect(() => validatePath([kf(2), kf(1)])).toThrow(InvalidPathError);
    expect(() => validatePath([{ ...kf(0), id: "a" }, { ...kf(1), id: "a" }])).toThrow(InvalidPathError);
    expect(() => validatePath([kf(0), { ...kf(1), position: [NaN, 0, 0] }])).toThrow(InvalidPathError);
    expect(() => validatePath([kf(0), kf(1), kf(5)])).not.toThrow();
  });

  // P5
  it("PBT: a path is accepted iff its times strictly increase", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 50 }), { minLength: 2, maxLength: 8 }), (times) => {
        const increasing = times.every((t, i) => i === 0 || t > times[i - 1]!);
        const frames = times.map((t) => kf(t));
        if (increasing) expect(() => validatePath(frames)).not.toThrow();
        else expect(() => validatePath(frames)).toThrow(InvalidPathError);
      }),
    );
  });

  it("samples exactly at keyframes and stays inside the time range", () => {
    const path = new CameraPath([kf(0), kf(2), kf(6)]);
    expect(path.sample(0).position.x).toBeCloseTo(0);
    expect(path.sample(2).position.x).toBeCloseTo(2);
    expect(path.sample(6).position.x).toBeCloseTo(6);
    expect(path.sample(100).position.x).toBeCloseTo(6);
    expect(path.sample(-5).position.x).toBeCloseTo(0);
  });

  it("player plays, scrubs, jumps and reports keyframes", () => {
    const frames: Keyframe[] = [{ ...kf(0), id: "a" }, { ...kf(2), id: "b" }, { ...kf(4), id: "c" }];
    const seen: number[] = [];
    const player = scene.setPath(frames, { onKeyframe: (i) => seen.push(i) });
    expect(scene.getCameraPresetIds()).toEqual(expect.arrayContaining(["a", "b", "c"]));
    player.play();
    for (let i = 0; i < 100; i++) player.update(0.05);
    expect(player.isPlaying).toBe(false);
    expect(player.currentTime).toBeCloseTo(4);
    expect(seen).toEqual(expect.arrayContaining([0, 1, 2]));
    player.seek(1);
    expect(player.currentTime).toBe(1);
    expect(player.jumpTo("b", 0.5)).toBe(true);
    for (let i = 0; i < 20; i++) player.update(0.05);
    expect(player.currentTime).toBeCloseTo(2);
    expect(player.isPlaying).toBe(false);
    expect(player.jumpTo("zzz")).toBe(false);
  });
});

describe("budget", () => {
  it("measures triangles and warns without throwing", () => {
    const m = measureScene(scene.modelSlot);
    expect(m.triangles).toBeGreaterThan(0);
    expect(checkBudget(m, { triangles: 1, drawCalls: 1, maxTextureEdge: 1, textureMegabytes: 0 }).length).toBeGreaterThan(0);
    expect(checkBudget(m)).toEqual([]);
  });

  it("reports a warning through onWarning when the model is too heavy", () => {
    const warn = vi.fn();
    const s = createSpecterScene(document.createElement("div"), { headless: true, onWarning: warn, budget: { triangles: 2, drawCalls: 999, maxTextureEdge: 999, textureMegabytes: 999 } });
    s.setModel(room());
    expect(warn).toHaveBeenCalled();
    s.destroy();
  });
});

describe("spec context", () => {
  it("lists targetable names and skips exporter noise", () => {
    const g = new THREE.Group();
    g.add(namedMesh("Object_12", new THREE.BoxGeometry(), pbr("#fff")));
    g.add(namedMesh("Coffee Table", new THREE.BoxGeometry(), pbr("#fff")));
    const s = createSpecterScene(document.createElement("div"), { headless: true });
    s.setModel(g);
    const ctx = s.getSpecContext({ app: "t" });
    expect(ctx.meshes).toContain("Coffee Table");
    expect(ctx.meshes).not.toContain("Object_12");
    s.destroy();
  });
});

describe("path player host", () => {
  it("disables orbit controls while a path plays", () => {
    const calls: boolean[] = [];
    const cam = new THREE.PerspectiveCamera();
    const p = new PathPlayer(new CameraPath([{ t: 0, position: [0, 0, 5], target: [0, 0, 0] }, { t: 1, position: [0, 0, 1], target: [0, 0, 0] }]), {
      camera: cam,
      controlsTarget: new THREE.Vector3(),
      setControlsEnabled: (e) => calls.push(e),
    });
    p.play();
    p.pause();
    expect(calls).toEqual([false, true]);
  });
});

describe("model loading fallbacks", () => {
  it("falls back quietly when an optional GLB is missing (HTML fallback page)", async () => {
    const onError = vi.fn();
    const s = createSpecterScene(document.createElement("div"), { headless: true, onError });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } })));
    const r = await s.loadModel("/models/none.glb", { fallback: room });
    expect(r.source).toBe("fallback");
    expect(onError).not.toHaveBeenCalled();
    expect(s.container.querySelector(".specter-toast")).toBeNull();
    expect(listTargets(s.modelSlot)).toContain("sofa");
    s.destroy();
    vi.unstubAllGlobals();
  });

  it("reports and falls back when the file exists but is corrupt", async () => {
    const onError = vi.fn();
    const s = createSpecterScene(document.createElement("div"), { headless: true, onError });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => (init?.method === "HEAD" ? new Response(null, { status: 200, headers: { "content-type": "model/gltf-binary" } }) : new Response(new Uint8Array([1, 2, 3]), { status: 200 }))),
    );
    const r = await s.loadModel("/models/bad.glb", { fallback: room });
    expect(r.source).toBe("fallback");
    expect(onError).toHaveBeenCalled();
    expect(s.container.querySelector(".specter-toast")?.textContent).toContain("simplified");
    s.destroy();
    vi.unstubAllGlobals();
  });
});
