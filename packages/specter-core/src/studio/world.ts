import * as THREE from "three";
import { isAllowedAssetUrl } from "specter-library";
import { createSpeaker, isSpeechOutputSupported, type AddInteractionOp, type AddLightOp, type AddObjectOp, type AnimateOp, type AssetSource, type DuplicateOp, type InteractionAction, type SetEnvironmentOp, type Speaker, type TransformOp, type UndoFn } from "specter-voice";
import { DEFAULT_BUDGET, measureScene } from "../budget";
import { disposeMaterial } from "../dispose";
import { TargetNotFoundError } from "../errors";
import { findByName } from "../find";
import { loadHdriEnvironment, type LightingPreset } from "../lighting";
import { loadGltf } from "../loader";
import type { SpecterScene } from "../scene";
import { recipeCatalogue } from "./recipes";
import { buildPart, buildParts, DEG2RAD } from "./shapes";
import type { SpecContext } from "specter-voice";

export type ObjectKind = "primitive" | "composite" | "asset" | "light" | "copy";

export interface StudioObject {
  id: string;
  kind: ObjectKind;
  object: THREE.Object3D;
  /** Library or generation record. Always present for assets so credits are never lost. */
  asset?: AssetSource;
  /** Source object id for copies. */
  copyOf?: string;
}

interface Motion {
  motion: Exclude<AnimateOp["motion"], "stop">;
  axis: "x" | "y" | "z";
  speed: number;
  around?: string;
  radius?: number;
  angle: number;
  t: number;
  paused: boolean;
  base: { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 };
}

type Triggers = Partial<Record<"click" | "hover", InteractionAction>>;

const MAX_OBJECTS = 200;
const TRIANGLE_LIMIT = DEFAULT_BUDGET.triangles * 1.5;

const DEFAULT_LOOKS: Record<string, { lighting: LightingPreset; background: [string, string]; ground: boolean }> = {
  studio: { lighting: "studio", background: ["#2a1d44", "#0b0813"], ground: true },
  indoor: { lighting: "indoor", background: ["#3a2a24", "#120c0a"], ground: true },
  night: { lighting: "night", background: ["#0b1026", "#02030a"], ground: true },
  space: { lighting: "night", background: ["#04040c", "#000000"], ground: false },
  sunset: { lighting: "sunset", background: ["#ff9a5a", "#3b1f4a"], ground: true },
  daylight: { lighting: "daylight", background: ["#8ecbff", "#e8f4ff"], ground: true },
};

function snapshot(o: THREE.Object3D) {
  return { position: o.position.clone(), rotation: o.rotation.clone(), scale: o.scale.clone() };
}
function restore(o: THREE.Object3D, s: ReturnType<typeof snapshot>) {
  o.position.copy(s.position);
  o.rotation.copy(s.rotation);
  o.scale.copy(s.scale);
}

/** Collect GPU resources under `o`. */
function resources(o: THREE.Object3D) {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry) geos.add(m.geometry);
    const mat = (m as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => mats.add(x));
  });
  return { geos, mats };
}

/**
 * Everything Studio adds lives here: objects, lights, copies, motions, interactions and the environment.
 * Every mutation returns an undo function, and removing an object only frees GPU resources nothing else uses
 * (copies share geometry with their originals).
 */
export class StudioWorld {
  readonly objects = new Map<string, StudioObject>();
  private motions = new Map<string, Motion>();
  private interactions = new Map<string, Triggers>();
  private highlighted = new Map<THREE.Mesh, THREE.Color>();
  private ground: THREE.Group;
  private stars: THREE.Points | null = null;
  private envName: string = "studio";
  private offFrame: () => void;
  private offPick: () => void;
  private offHover: () => void;
  private speaker: Speaker | null = isSpeechOutputSupported() ? createSpeaker() : null;
  private paused = false;
  /** Edit mode: clicks select objects. Play mode: clicks run interactions. */
  mode: "edit" | "play" = "edit";
  onSelect?: (id: string | null) => void;
  onChange?: () => void;
  lang: () => string = () => "en-US";

  constructor(readonly scene: SpecterScene) {
    this.ground = this.buildGround();
    scene.root.add(this.ground);
    this.offFrame = scene.onFrame((dt) => this.tick(dt));
    this.offPick = scene.onPick((hit) => this.handlePick(hit));
    this.offHover = scene.onHover((hit) => this.handleHover(hit));
    this.setMode("edit");
  }

  /** Spec context for the AI prompt and the offline parser. */
  context(extra: Partial<SpecContext> = {}): SpecContext {
    return this.scene.getSpecContext({
      app: "studio",
      subject: "an empty 3D studio scene the user builds by voice",
      recipes: recipeCatalogue(),
      objects: this.ids(),
      libraries: true,
      generate: false,
      ...extra,
    });
  }

  // ---------------- queries ----------------

  list(): StudioObject[] {
    return [...this.objects.values()];
  }

  ids(): string[] {
    return [...this.objects.keys()];
  }

  /** Top-level object that owns a picked mesh. */
  ownerOf(hit: THREE.Object3D | null): StudioObject | null {
    for (let o: THREE.Object3D | null = hit; o && o !== this.scene.modelSlot; o = o.parent) {
      const id = o.userData.studioId as string | undefined;
      if (id && this.objects.has(id)) return this.objects.get(id)!;
    }
    return null;
  }

  find(name: string): THREE.Object3D {
    const o = this.objects.get(name)?.object ?? findByName(this.scene.modelSlot, name);
    if (!o) throw new TargetNotFoundError(name, "mesh");
    return o;
  }

  motionOf(id: string): Motion["motion"] | null {
    return this.motions.get(id)?.motion ?? null;
  }

  interactionsOf(id: string): Triggers {
    return { ...(this.interactions.get(id) ?? {}) };
  }

  credits(): AssetSource[] {
    return this.list()
      .map((o) => o.asset)
      .filter((a): a is AssetSource => Boolean(a));
  }

  get environment(): string {
    return this.envName;
  }

  get motionPaused(): boolean {
    return this.paused;
  }

  setMotionPaused(p: boolean): void {
    this.paused = p;
  }

  setMode(mode: "edit" | "play"): void {
    this.mode = mode;
    this.scene.modelSlot.userData.editMode = mode === "edit";
    this.scene.modelSlot.traverse((o) => {
      if (o.userData.editorOnly) o.visible = mode === "edit";
    });
    if (mode === "edit") this.clearHighlights();
    this.scene.hotspots.hideMessage();
  }

  // ---------------- objects ----------------

  private register(id: string, kind: ObjectKind, object: THREE.Object3D, extra: Partial<StudioObject> = {}): UndoFn {
    if (this.objects.has(id) || findByName(this.scene.modelSlot, id)) {
      this.disposeObject(object);
      throw new Error(`An object named "${id}" already exists`);
    }
    if (this.objects.size >= MAX_OBJECTS) {
      this.disposeObject(object);
      throw new Error(`The scene already has ${MAX_OBJECTS} objects. Delete some first.`);
    }
    object.name = id;
    object.userData.studioId = id;
    object.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh && !c.userData.editorOnly) {
        m.castShadow = m.castShadow !== false;
        m.receiveShadow = true;
      }
    });
    this.scene.modelSlot.add(object);
    this.objects.set(id, { id, kind, object, ...extra });
    const tris = measureScene(this.scene.modelSlot).triangles;
    if (tris > TRIANGLE_LIMIT) {
      this.objects.delete(id);
      object.removeFromParent();
      this.disposeObject(object);
      throw new Error(`That would make the scene too heavy (${tris.toLocaleString()} triangles). Try a simpler model.`);
    }
    this.scene.hotspots.refreshAnchors();
    this.onChange?.();
    return () => this.removeNow(id);
  }

  /** Free resources not used anywhere else in the scene (copies share geometry with originals). */
  private disposeObject(object: THREE.Object3D): void {
    const mine = resources(object);
    const others = resources(this.scene.modelSlot);
    for (const g of mine.geos) if (!others.geos.has(g)) g.dispose();
    for (const m of mine.mats) if (!others.mats.has(m)) disposeMaterial(m);
  }

  private removeNow(id: string): void {
    const rec = this.objects.get(id);
    if (!rec) return;
    this.motions.delete(id);
    this.interactions.delete(id);
    rec.object.removeFromParent();
    this.objects.delete(id);
    this.disposeObject(rec.object);
    this.onChange?.();
  }

  private place(object: THREE.Object3D, op: { position?: [number, number, number]; on?: string; rotation?: [number, number, number]; scale?: number }): void {
    if (op.rotation) object.rotation.set(op.rotation[0] * DEG2RAD, op.rotation[1] * DEG2RAD, op.rotation[2] * DEG2RAD);
    if (op.scale) object.scale.multiplyScalar(op.scale);
    if (op.on) {
      this.putOn(object, this.find(op.on));
    } else if (op.position) {
      object.position.set(...op.position);
    } else {
      this.autoPlace(object);
    }
  }

  /** Put new things beside what is already there instead of inside it. */
  private autoPlace(object: THREE.Object3D): void {
    const others = this.list().map((o) => o.object).filter((o) => o !== object && o.visible);
    if (!others.length) return;
    const scene = new THREE.Box3();
    for (const o of others) scene.expandByObject(o);
    if (scene.isEmpty()) return;
    const mine = new THREE.Box3().setFromObject(object);
    const w = mine.isEmpty() ? 1 : mine.max.x - mine.min.x;
    const cx = mine.isEmpty() ? 0 : (mine.max.x + mine.min.x) / 2 - object.position.x;
    object.position.x = scene.max.x + w / 2 + 0.4 - cx;
    object.position.z = (scene.max.z + scene.min.z) / 2;
  }

  private putOn(object: THREE.Object3D, target: THREE.Object3D): void {
    target.updateWorldMatrix(true, true);
    const tb = new THREE.Box3().setFromObject(target);
    object.updateWorldMatrix(true, true);
    const ob = new THREE.Box3().setFromObject(object);
    if (tb.isEmpty()) return;
    const tc = tb.getCenter(new THREE.Vector3());
    const oc = ob.isEmpty() ? object.position.clone() : ob.getCenter(new THREE.Vector3());
    const bottomOffset = ob.isEmpty() ? 0 : oc.y - ob.min.y;
    const world = new THREE.Vector3(tc.x, tb.max.y + bottomOffset, tc.z).sub(oc.clone().sub(object.getWorldPosition(new THREE.Vector3())));
    object.position.copy(object.parent ? object.parent.worldToLocal(world) : world);
  }

  /** Scale a loaded model to a target height and stand it on the ground at its origin. */
  private normalize(model: THREE.Object3D, height: number): THREE.Group {
    const wrap = new THREE.Group();
    wrap.add(model);
    model.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(model);
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const s = height / Math.max(1e-6, size.y);
      model.scale.multiplyScalar(s);
      model.updateWorldMatrix(true, true);
      const b2 = new THREE.Box3().setFromObject(model);
      const c = b2.getCenter(new THREE.Vector3());
      model.position.x -= c.x;
      model.position.z -= c.z;
      model.position.y -= b2.min.y;
    }
    return wrap;
  }

  async addObject(op: AddObjectOp): Promise<UndoFn> {
    const src = op.source;
    let object: THREE.Object3D;
    let kind: ObjectKind;
    let asset: AssetSource | undefined;
    if (src.type === "primitive") {
      const g = new THREE.Group();
      g.add(buildPart(src.part));
      object = g;
      kind = "primitive";
    } else if (src.type === "composite") {
      const g = new THREE.Group();
      buildParts(src.parts, g);
      object = g;
      kind = "composite";
    } else if (src.type === "asset") {
      if (![src.url, ...Object.values(src.urlMap ?? {})].every(isAllowedAssetUrl)) throw new Error("That model is not from an allowed library");
      const loaded = await loadGltf(src.url, { urlMap: src.urlMap, timeoutMs: 30000, preflight: false });
      object = this.normalize(loaded.object, op.height ?? 1);
      kind = "asset";
      asset = src;
    } else {
      throw new Error(`"${src.type}" objects must be prepared before they are added`);
    }
    if (src.type !== "asset" && op.height) {
      const box = new THREE.Box3().setFromObject(object);
      if (!box.isEmpty()) object.scale.multiplyScalar(op.height / Math.max(1e-6, box.max.y - box.min.y));
    }
    if (op.color) this.tint(object, op.color);
    this.place(object, op);
    return this.register(op.id, kind, object, { asset });
  }

  private tint(object: THREE.Object3D, color: string): void {
    object.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      m.material = Array.isArray(m.material)
        ? mats.map((x) => {
            const y = x.clone() as THREE.MeshStandardMaterial;
            y.color?.set(color);
            return y;
          })
        : (() => {
            const y = mats[0]!.clone() as THREE.MeshStandardMaterial;
            y.color?.set(color);
            return y;
          })();
    });
  }

  removeObject(id: string): UndoFn {
    const rec = this.objects.get(id);
    if (!rec) throw new TargetNotFoundError(id, "mesh");
    const motion = this.motions.get(id);
    const inter = this.interactions.get(id);
    // detach but keep resources alive until the undo history is gone
    rec.object.removeFromParent();
    this.objects.delete(id);
    this.motions.delete(id);
    this.interactions.delete(id);
    const hotspotIds = this.scene.hotspots.list().filter((h) => h.mesh && !findByName(this.scene.modelSlot, h.mesh)).map((h) => h.id);
    const removedHotspots = hotspotIds.map((h) => this.scene.hotspots.remove(h)!).filter(Boolean);
    this.onChange?.();
    return () => {
      this.scene.modelSlot.add(rec.object);
      this.objects.set(id, rec);
      if (motion) this.motions.set(id, motion);
      if (inter) this.interactions.set(id, inter);
      for (const h of removedHotspots) this.scene.hotspots.add(h);
      this.onChange?.();
    };
  }

  transform(op: TransformOp): UndoFn {
    const o = this.find(op.target);
    const before = snapshot(o);
    const motion = this.motions.get(this.ownerOf(o)?.id ?? op.target);
    const motionBase = motion ? { ...motion.base, position: motion.base.position.clone(), rotation: motion.base.rotation.clone(), scale: motion.base.scale.clone() } : null;
    if (motion) restore(o, motion.base);
    if (op.position) o.position.set(...op.position);
    if (op.move) o.position.add(new THREE.Vector3(...op.move));
    if (op.rotation) o.rotation.set(op.rotation[0] * DEG2RAD, op.rotation[1] * DEG2RAD, op.rotation[2] * DEG2RAD);
    if (op.rotateBy) {
      o.rotation.x += op.rotateBy[0] * DEG2RAD;
      o.rotation.y += op.rotateBy[1] * DEG2RAD;
      o.rotation.z += op.rotateBy[2] * DEG2RAD;
    }
    if (op.scale !== undefined) {
      if (Array.isArray(op.scale)) o.scale.set(...op.scale);
      else o.scale.setScalar(op.scale);
    }
    if (op.scaleBy) o.scale.multiplyScalar(op.scaleBy);
    if (op.on) {
      const target = this.find(op.on);
      if (target === o || target.parent === o) throw new Error("An object can't be put on itself");
      this.putOn(o, target);
    }
    if (motion) motion.base = snapshot(o);
    this.scene.hotspots.refreshAnchors();
    this.onChange?.();
    return () => {
      restore(o, before);
      if (motion && motionBase) motion.base = motionBase;
      this.onChange?.();
    };
  }

  duplicate(op: DuplicateOp): UndoFn {
    const src = this.objects.get(op.target);
    const original = src?.object ?? this.find(op.target);
    const box = new THREE.Box3().setFromObject(original);
    const size = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
    const spacing = op.spacing ?? Math.max(size.x, size.z) + 0.3;
    const undos: UndoFn[] = [];
    const n = op.count;
    const rand = (() => {
      let a = 1234567;
      return () => {
        a = (a * 16807) % 2147483647;
        return a / 2147483647;
      };
    })();
    try {
      for (let k = 1; k <= n; k++) {
        const copy = original.clone(true);
        copy.traverse((c) => {
          if (c !== copy && c.name) c.name = `${c.name}_${k + 1}`;
          // materials are cloned so a later colour change on one copy doesn't change the others
          const m = c as THREE.Mesh;
          if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
        });
        const p = original.position;
        if (op.layout === "row") copy.position.set(p.x + spacing * k, p.y, p.z);
        else if (op.layout === "grid") {
          const cols = Math.ceil(Math.sqrt(n + 1));
          copy.position.set(p.x + (k % cols) * spacing, p.y, p.z + Math.floor(k / cols) * spacing);
        } else if (op.layout === "ring") {
          const r = op.radius ?? Math.max(spacing * (n + 1) / (2 * Math.PI), spacing);
          const a = (k / (n + 1)) * Math.PI * 2;
          // the original sits at angle 0 on the ring
          copy.position.set(p.x - r + r * Math.cos(a), p.y, p.z + r * Math.sin(a));
          copy.rotation.y = original.rotation.y - a;
        } else {
          const r = op.radius ?? spacing * Math.sqrt(n + 1);
          copy.position.set(p.x + (rand() - 0.5) * 2 * r, p.y, p.z + (rand() - 0.5) * 2 * r);
          copy.rotation.y = rand() * Math.PI * 2;
        }
        let suffix = k + 1;
        let id = `${op.target}_${suffix}`;
        while (this.objects.has(id) || findByName(this.scene.modelSlot, id)) id = `${op.target}_${++suffix}`;
        undos.push(this.register(id, "copy", copy, { copyOf: op.target, asset: src?.asset }));
      }
    } catch (e) {
      for (let i = undos.length - 1; i >= 0; i--) undos[i]!();
      throw e;
    }
    return () => {
      for (let i = undos.length - 1; i >= 0; i--) undos[i]!();
    };
  }

  addLight(op: AddLightOp): UndoFn {
    const color = new THREE.Color(op.color ?? "#ffffff");
    const g = new THREE.Group();
    let light: THREE.Light;
    if (op.kind === "point") light = new THREE.PointLight(color, op.intensity ?? 30, 0, 2);
    else if (op.kind === "spot") light = new THREE.SpotLight(color, op.intensity ?? 60, 0, Math.PI / 6, 0.35, 2);
    else if (op.kind === "directional") light = new THREE.DirectionalLight(color, op.intensity ?? 2);
    else light = new THREE.AmbientLight(color, op.intensity ?? 0.6);
    light.name = `${op.id}_light`;
    g.add(light);
    if (op.kind !== "ambient") {
      // a small bulb so the light can be seen, picked and moved in edit mode
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color }));
      bulb.name = `${op.id}_bulb`;
      bulb.userData.editorOnly = true;
      bulb.castShadow = false;
      bulb.visible = this.mode === "edit";
      g.add(bulb);
    }
    g.position.set(...(op.position ?? [0, 3, 2]));
    const undo = this.register(op.id, "light", g);
    if (op.target && (light as THREE.SpotLight).target) {
      const t = this.find(op.target);
      (light as THREE.SpotLight).target = t;
    }
    return undo;
  }

  // ---------------- motion ----------------

  animate(op: AnimateOp): UndoFn {
    const o = this.find(op.target);
    const key = op.target;
    const prev = this.motions.get(key);
    const prevTransform = snapshot(o);
    if (op.motion === "stop") {
      if (!prev) return () => undefined;
      this.motions.delete(key);
      return () => {
        this.motions.set(key, prev);
      };
    }
    if (op.around) {
      const a = this.find(op.around);
      if (a === o) throw new Error("An object can't orbit itself");
      for (let p: THREE.Object3D | null = a; p; p = p.parent) if (p === o) throw new Error(`${op.target} can't orbit something attached to it`);
    }
    const base = prev ? prev.base : snapshot(o);
    if (prev) restore(o, prev.base);
    let angle = 0;
    let radius = op.radius;
    if (op.motion === "orbit" && op.around) {
      const c = this.find(op.around).getWorldPosition(new THREE.Vector3());
      const p = o.getWorldPosition(new THREE.Vector3());
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      radius = radius ?? Math.max(0.5, Math.hypot(dx, dz) || 2);
      angle = Math.atan2(dz, dx);
    }
    this.motions.set(key, { motion: op.motion, axis: op.axis ?? (op.motion === "swing" ? "z" : "y"), speed: op.speed ?? 1, around: op.around, radius, angle, t: 0, paused: false, base });
    return () => {
      if (prev) this.motions.set(key, prev);
      else this.motions.delete(key);
      restore(o, prevTransform);
    };
  }

  toggleMotion(name: string): void {
    const m = this.motions.get(name) ?? this.motions.get(this.ownerOf(this.find(name))?.id ?? "");
    if (m) m.paused = !m.paused;
  }

  private tick(dt: number): void {
    if (this.paused || this.motions.size === 0) return;
    for (const [name, m] of this.motions) {
      if (m.paused) continue;
      const o = findByName(this.scene.modelSlot, name);
      if (!o) continue;
      m.t += dt * m.speed;
      if (m.motion === "spin") {
        o.rotation[m.axis] += dt * m.speed * 0.8;
      } else if (m.motion === "orbit" && m.around) {
        const a = findByName(this.scene.modelSlot, m.around);
        if (!a) continue;
        m.angle += dt * m.speed * ((Math.PI * 2) / 10);
        const c = a.getWorldPosition(new THREE.Vector3());
        const cur = o.getWorldPosition(new THREE.Vector3());
        const world = new THREE.Vector3(c.x + Math.cos(m.angle) * (m.radius ?? 2), cur.y, c.z + Math.sin(m.angle) * (m.radius ?? 2));
        o.position.copy(o.parent ? o.parent.worldToLocal(world) : world);
      } else if (m.motion === "bob") {
        o.position.y = m.base.position.y + Math.sin(m.t * 2) * 0.15 * Math.max(0.5, m.base.scale.y);
      } else if (m.motion === "pulse") {
        const f = 1 + Math.sin(m.t * 3) * 0.08;
        o.scale.copy(m.base.scale).multiplyScalar(f);
      } else if (m.motion === "swing") {
        o.rotation[m.axis] = m.base.rotation[m.axis] + Math.sin(m.t * 2) * 0.35;
      }
    }
  }

  // ---------------- interactions ----------------

  addInteraction(op: AddInteractionOp): UndoFn {
    this.find(op.target);
    if (op.action.type === "toggleVisibility") this.find(op.action.target);
    const prev = this.interactions.get(op.target);
    this.interactions.set(op.target, { ...(prev ?? {}), [op.trigger]: op.action });
    this.onChange?.();
    return () => {
      if (prev) this.interactions.set(op.target, prev);
      else this.interactions.delete(op.target);
      this.onChange?.();
    };
  }

  removeInteraction(target: string, trigger?: "click" | "hover"): UndoFn {
    const prev = this.interactions.get(target);
    if (!prev) return () => undefined;
    if (trigger) {
      const next = { ...prev };
      delete next[trigger];
      this.interactions.set(target, next);
    } else this.interactions.delete(target);
    return () => {
      this.interactions.set(target, prev);
    };
  }

  /** Nearest named ancestor of a hit that has an interaction. */
  private interactiveOf(hit: THREE.Object3D | null): { name: string; triggers: Triggers } | null {
    for (let o: THREE.Object3D | null = hit; o && o !== this.scene.modelSlot; o = o.parent) {
      if (o.name && this.interactions.has(o.name)) return { name: o.name, triggers: this.interactions.get(o.name)! };
    }
    return null;
  }

  private handlePick(hit: THREE.Object3D | null): boolean {
    if (this.mode === "edit") {
      const owner = this.ownerOf(hit);
      this.onSelect?.(owner?.id ?? null);
      return owner !== null;
    }
    const it = this.interactiveOf(hit);
    if (!it?.triggers.click) return false;
    this.run(it.name, it.triggers.click, "click");
    return true;
  }

  private hovered: { name: string; action: InteractionAction } | null = null;

  private handleHover(hit: THREE.Object3D | null): void {
    if (this.mode !== "play") return;
    const it = this.interactiveOf(hit);
    if (this.hovered && this.hovered.name !== it?.name) {
      if (this.hovered.action.type === "highlight") this.unhighlight(this.hovered.name);
      if (this.hovered.action.type === "showInfo") this.scene.hotspots.hideMessage();
      this.hovered = null;
    }
    const canvas = this.scene.renderer?.domElement;
    if (canvas) canvas.style.cursor = it ? "pointer" : "";
    if (it?.triggers.hover && this.hovered?.name !== it.name) {
      this.hovered = { name: it.name, action: it.triggers.hover };
      this.run(it.name, it.triggers.hover, "hover");
    }
  }

  /** Run an interaction action. Exposed so the UI and tests can preview it. */
  run(name: string, action: InteractionAction, trigger: "click" | "hover" = "click"): void {
    switch (action.type) {
      case "showInfo":
        this.scene.hotspots.showMessage(action.title ?? name.replace(/[_-]+/g, " "), action.body);
        break;
      case "speak":
        this.speaker?.speak(action.text, { lang: this.lang() });
        break;
      case "focus":
        this.scene.focusMesh(name);
        break;
      case "toggleAnimation":
        this.toggleMotion(name);
        break;
      case "toggleVisibility": {
        const t = this.find(action.target);
        t.visible = !t.visible;
        break;
      }
      case "highlight":
        if (trigger === "click" && this.isHighlighted(name)) this.unhighlight(name);
        else this.highlight(name, action.color ?? "#ffd27a");
        break;
    }
  }

  private isHighlighted(name: string): boolean {
    let yes = false;
    this.find(name).traverse((c) => {
      if (this.highlighted.has(c as THREE.Mesh)) yes = true;
    });
    return yes;
  }

  private highlight(name: string, color: string): void {
    this.find(name).traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh || this.highlighted.has(m)) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (!mat?.emissive) return;
      this.highlighted.set(m, mat.emissive.clone());
      // clone so the highlight never leaks into shared materials
      const c2 = mat.clone();
      c2.emissive = new THREE.Color(color);
      c2.emissiveIntensity = Math.max(c2.emissiveIntensity, 0.8);
      m.userData.preHighlight = mat;
      m.material = c2;
    });
  }

  private unhighlight(name: string): void {
    this.find(name).traverse((c) => this.restoreHighlight(c as THREE.Mesh));
  }

  private restoreHighlight(m: THREE.Mesh): void {
    if (!this.highlighted.has(m)) return;
    const original = m.userData.preHighlight as THREE.Material | undefined;
    if (original) {
      (m.material as THREE.Material).dispose();
      m.material = original;
    }
    delete m.userData.preHighlight;
    this.highlighted.delete(m);
  }

  private clearHighlights(): void {
    for (const m of [...this.highlighted.keys()]) this.restoreHighlight(m);
  }

  // ---------------- environment ----------------

  private buildGround(): THREE.Group {
    const g = new THREE.Group();
    g.name = "studio-ground";
    g.userData.specterIgnore = true;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(30, 72), new THREE.MeshStandardMaterial({ color: 0x1a1426, roughness: 0.95, metalness: 0 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.001;
    disc.receiveShadow = true;
    const grid = new THREE.GridHelper(40, 40, 0x6b5a99, 0x30264a);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    grid.name = "studio-grid";
    g.add(disc, grid);
    return g;
  }

  private setStars(on: boolean): void {
    if (on && !this.stars) {
      const pos: number[] = [];
      let a = 99;
      const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 1500; i++) {
        const rad = 80 + r() * 60;
        const th = r() * Math.PI * 2;
        const ph = Math.acos(2 * r() - 1);
        pos.push(rad * Math.sin(ph) * Math.cos(th), rad * Math.cos(ph), rad * Math.sin(ph) * Math.sin(th));
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.9 }));
      this.stars.name = "studio-stars";
      this.scene.root.add(this.stars);
    } else if (!on && this.stars) {
      this.stars.removeFromParent();
      this.stars.geometry.dispose();
      (this.stars.material as THREE.Material).dispose();
      this.stars = null;
    }
  }

  async setEnvironment(op: SetEnvironmentOp, fetchImpl: typeof fetch = fetch): Promise<UndoFn> {
    const prev = { name: this.envName, lighting: this.scene.getLighting(), ground: this.ground.visible, stars: Boolean(this.stars), background: this.scene.scene.background };
    const prevBg = this.lastBackground;
    if (op.preset) {
      const look = DEFAULT_LOOKS[op.preset]!;
      this.scene.applyLighting(look.lighting);
      this.applyBackground(look.background);
      this.ground.visible = look.ground;
      this.setStars(op.preset === "space" || op.preset === "night");
      this.envName = op.preset;
      if (this.scene.renderer) this.scene.setEnvironmentTexture(null);
    }
    if (op.hdri && this.scene.renderer) {
      const files = await (await fetchImpl(`https://api.polyhaven.com/files/${encodeURIComponent(op.hdri)}`)).json();
      const url = files?.hdri?.["1k"]?.hdr?.url as string | undefined;
      if (!url || !isAllowedAssetUrl(url)) throw new Error(`Sky "${op.hdri}" was not found on Poly Haven`);
      const handle = await loadHdriEnvironment(this.scene.renderer, url);
      this.scene.setEnvironmentTexture(handle, true);
      this.envName = op.hdri;
    }
    if (op.background) this.applyBackground(op.background);
    if (op.ground !== undefined) this.ground.visible = op.ground;
    this.onChange?.();
    return () => {
      this.scene.applyLighting(prev.lighting);
      if (prevBg) this.applyBackground(prevBg);
      this.ground.visible = prev.ground;
      this.setStars(prev.stars);
      this.envName = prev.name;
      if (this.scene.renderer) {
        this.scene.setEnvironmentTexture(null);
        if (!prevBg) this.scene.scene.background = prev.background;
      }
      this.onChange?.();
    };
  }

  private lastBackground: string | [string, string] | null = null;
  private applyBackground(bg: string | [string, string]): void {
    this.lastBackground = bg;
    this.scene.setBackground(bg);
  }

  get groundVisible(): boolean {
    return this.ground.visible;
  }

  // ---------------- teardown ----------------

  /** Remove every object (for "new scene"). Not undoable; the controller history should be reset too. */
  clear(): void {
    for (const id of [...this.objects.keys()]) this.removeNow(id);
    this.motions.clear();
    this.interactions.clear();
    this.highlighted.clear();
  }

  destroy(): void {
    this.offFrame();
    this.offPick();
    this.offHover();
    this.speaker?.stop();
    this.clear();
    this.setStars(false);
    this.ground.removeFromParent();
    this.ground.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose();
    });
  }
}
