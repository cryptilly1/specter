import * as THREE from "three";
import type { UndoFn } from "specter-voice";
import { disposeMaterial } from "./dispose";
import { TargetNotFoundError } from "./errors";
import { findByName, meshesIn } from "./find";

export interface MaterialPatch {
  color?: string;
  emissive?: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
}

type AnyMat = THREE.Material & {
  color?: THREE.Color;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
};

/**
 * Applies material changes to one named mesh (or group) without touching any other mesh. Materials are cloned
 * before the first edit so a material shared by several meshes is never mutated for the others.
 */
export class MaterialStore {
  /** Replaced original materials. Disposed at destroy so no GPU resources linger. */
  private retired = new Set<THREE.Material>();

  constructor(private readonly root: THREE.Object3D) {}

  /** Returns the names of meshes that were changed and an undo function. */
  set(meshName: string, patch: MaterialPatch): { changed: string[]; undo: UndoFn } {
    const target = findByName(this.root, meshName);
    if (!target) throw new TargetNotFoundError(meshName, "mesh");

    const undos: UndoFn[] = [];
    const changed: string[] = [];

    for (const mesh of meshesIn(target)) {
      const original = mesh.material;
      const cloneOne = (m: THREE.Material): THREE.Material => {
        const c = m.clone();
        c.userData = { ...c.userData, specterClone: true };
        return c;
      };
      const wasArray = Array.isArray(original);
      const originals: THREE.Material[] = wasArray ? (original as THREE.Material[]) : [original as THREE.Material];
      const clones = originals.map(cloneOne);
      mesh.material = wasArray ? clones : clones[0]!;

      for (const m of clones as AnyMat[]) {
        if (patch.color !== undefined && m.color) m.color.set(patch.color);
        if (patch.emissive !== undefined && m.emissive) {
          m.emissive.set(patch.emissive);
          m.emissiveIntensity = Math.max(m.emissiveIntensity ?? 0, 1.4);
        }
        if (patch.roughness !== undefined && "roughness" in m) m.roughness = patch.roughness;
        if (patch.metalness !== undefined && "metalness" in m) m.metalness = patch.metalness;
        if (patch.opacity !== undefined) {
          m.opacity = patch.opacity;
          m.transparent = patch.opacity < 1;
          m.depthWrite = patch.opacity >= 1;
        }
        m.needsUpdate = true;
      }

      originals.forEach((o) => this.retired.add(o));
      changed.push(mesh.name || target.name);
      undos.push(() => {
        const current = mesh.material;
        mesh.material = original;
        originals.forEach((o) => this.retired.delete(o));
        (Array.isArray(current) ? current : [current]).forEach((c) => c.dispose());
      });
    }
    return {
      changed,
      undo: () => {
        for (let i = undos.length - 1; i >= 0; i--) undos[i]!();
      },
    };
  }

  disposeRetired(): void {
    this.retired.forEach((m) => disposeMaterial(m));
    this.retired.clear();
  }
}

export function setVisibility(root: THREE.Object3D, meshName: string, visible: boolean): UndoFn {
  const target = findByName(root, meshName);
  if (!target) throw new TargetNotFoundError(meshName, "mesh");
  const prev = target.visible;
  target.visible = visible;
  return () => {
    target.visible = prev;
  };
}
