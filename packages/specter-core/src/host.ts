import type * as THREE from "three";
import type { SpecContext } from "specter-voice";
import type { HotspotManager } from "./hotspots";
import type { MaterialStore } from "./materials";

export interface CameraViewLike {
  position: [number, number, number];
  target: [number, number, number];
}

/**
 * What the core ops need from a scene. `SpecterScene` implements it, and so does the React Three Fiber bridge,
 * so the same Spec can drive either renderer.
 */
export interface SpecterHost {
  readonly modelSlot: THREE.Object3D;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: { target: THREE.Vector3 } | null;
  readonly hotspots: HotspotManager;
  readonly materials: MaterialStore;
  goTo(id: string, seconds?: number): void;
  flyTo(view: CameraViewLike, seconds?: number): void;
  setMode(mode: "orbit" | "path"): void;
  getSpecContext(extra: Partial<SpecContext> & { app: string }): SpecContext;
}
