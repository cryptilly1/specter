import { OpRegistry, type UndoFn } from "specter-voice";
import { TargetNotFoundError } from "./errors";
import { setVisibility } from "./materials";
import type { SpecterHost } from "./host";
import { humanize } from "specter-voice";

export interface CoreOpHooks {
  /** Switch content pack. Return an undo function that restores the previous pack. */
  loadPack?: (pack: string) => Promise<UndoFn | void> | UndoFn | void;
  /** Apps can intercept camera targets that are not presets or path keyframes. */
  setCamera?: (to: string | undefined, mode: "orbit" | "path" | undefined) => UndoFn | void;
}

let autoId = 0;
function genId(prefix: string, ...parts: (string | undefined)[]): string {
  const base = parts.filter(Boolean).join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36);
  return `${prefix}-${base || ++autoId}`;
}

/**
 * Create an op registry whose core ops are bound to a SpecterScene. Pass the scene as the apply context
 * (`createCommandController({ registry, ctx: scene, ... })`).
 */
export function createSpecterRegistry(hooks: CoreOpHooks = {}): OpRegistry<SpecterHost> {
  const reg = new OpRegistry<SpecterHost>();

  reg.bind("addHotspot", (scene, op) => {
    const id = op.id ?? genId("hs", op.mesh, op.title);
    const { previous } = scene.hotspots.add({ id, kind: "hotspot", mesh: op.mesh, position: op.position, title: op.title, body: op.body });
    return () => {
      scene.hotspots.remove(id);
      if (previous) scene.hotspots.add(previous);
    };
  });

  reg.bind("addNote", (scene, op) => {
    const id = op.id ?? genId("note", op.mesh, op.text);
    const { previous } = scene.hotspots.add({
      id,
      kind: "note",
      mesh: op.mesh,
      position: op.position,
      title: op.mesh ? `Note on ${humanize(op.mesh).toLowerCase()}` : "Note",
      body: op.text,
    });
    return () => {
      scene.hotspots.remove(id);
      if (previous) scene.hotspots.add(previous);
    };
  });

  reg.bind("updateHotspot", (scene, op) => {
    const { previous } = scene.hotspots.update(op.id, { title: op.title, body: op.body });
    return () => {
      scene.hotspots.update(op.id, { title: previous.title, body: previous.body });
    };
  });

  reg.bind("removeHotspot", (scene, op) => {
    const removed = scene.hotspots.remove(op.id);
    if (!removed) throw new TargetNotFoundError(op.id, "hotspot");
    return () => {
      scene.hotspots.add(removed);
    };
  });

  reg.bind("setMaterial", (scene, op) => {
    const { undo } = scene.materials.set(op.mesh, {
      color: op.color,
      emissive: op.emissive,
      roughness: op.roughness,
      metalness: op.metalness,
      opacity: op.opacity,
    });
    return undo;
  });

  reg.bind("setVisibility", (scene, op) => setVisibility(scene.modelSlot, op.mesh, op.visible));

  reg.bind("setCamera", (scene, op) => {
    if (hooks.setCamera) {
      const undo = hooks.setCamera(op.to, op.mode);
      if (undo || !op.to) return undo;
    }
    const prev = { position: scene.camera.position.toArray() as [number, number, number], target: (scene.controls?.target.toArray() ?? [0, 0, 0]) as [number, number, number] };
    if (op.mode) scene.setMode(op.mode);
    if (op.to) scene.goTo(op.to);
    return () => scene.flyTo(prev, 0.8);
  });

  reg.bind("loadPack", async (_scene, op) => {
    if (!hooks.loadPack) throw new Error("This app has no content packs");
    return hooks.loadPack(op.pack);
  });

  return reg;
}
