import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { SpecterScene } from "specter-core";

export type GizmoMode = "translate" | "rotate" | "scale";

export interface GizmoCommit {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

const R2D = 180 / Math.PI;
const round = (n: number, d = 1000) => Math.round(n * d) / d;

/**
 * Move/rotate/scale handle. While dragging it moves the object directly for instant feedback. On release it puts the
 * object back and reports the final transform, so the app can apply it as a normal validated, undoable op.
 */
export class Gizmo {
  readonly controls: TransformControls | null;
  private helper: THREE.Object3D | null = null;
  private start: { p: THREE.Vector3; r: THREE.Euler; s: THREE.Vector3 } | null = null;
  private targetId: string | null = null;

  constructor(
    private scene: SpecterScene,
    private onCommit: (c: GizmoCommit) => void,
  ) {
    if (!scene.renderer) {
      this.controls = null;
      return;
    }
    const tc = new TransformControls(scene.camera, scene.renderer.domElement);
    tc.setSize(0.9);
    tc.addEventListener("dragging-changed", (e) => {
      if (scene.controls) scene.controls.enabled = !(e as unknown as { value: boolean }).value;
    });
    tc.addEventListener("mouseDown", () => {
      const o = tc.object;
      if (o) this.start = { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() };
    });
    tc.addEventListener("mouseUp", () => {
      const o = tc.object;
      if (!o || !this.start || !this.targetId) return;
      const end = { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() };
      const moved = !end.p.equals(this.start.p) || !end.r.equals(this.start.r) || !end.s.equals(this.start.s);
      o.position.copy(this.start.p);
      o.rotation.copy(this.start.r);
      o.scale.copy(this.start.s);
      this.start = null;
      if (!moved) return;
      this.onCommit({
        id: this.targetId,
        position: [round(end.p.x), round(end.p.y), round(end.p.z)],
        rotation: [round(end.r.x * R2D, 10), round(end.r.y * R2D, 10), round(end.r.z * R2D, 10)],
        scale: [Math.max(0.001, round(end.s.x)), Math.max(0.001, round(end.s.y)), Math.max(0.001, round(end.s.z))],
      });
    });
    this.helper = tc.getHelper();
    this.helper.userData.specterIgnore = true;
    scene.scene.add(this.helper);
    this.controls = tc;
  }

  /** True while the pointer is over a handle, so a click on the gizmo doesn't change the selection. */
  get busy(): boolean {
    return Boolean(this.controls && (this.controls.dragging || this.controls.axis));
  }

  attach(id: string | null, object: THREE.Object3D | null): void {
    this.targetId = id;
    if (!this.controls) return;
    if (object) this.controls.attach(object);
    else this.controls.detach();
  }

  setMode(m: GizmoMode): void {
    this.controls?.setMode(m);
  }

  setEnabled(on: boolean): void {
    if (!this.controls) return;
    this.controls.enabled = on;
    if (this.helper) this.helper.visible = on;
  }

  dispose(): void {
    if (!this.controls) return;
    this.controls.detach();
    this.helper?.removeFromParent();
    this.controls.dispose();
  }
}
