import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import {
  createSpecterRegistry,
  HotspotManager,
  injectStyles,
  listTargets,
  MaterialStore,
  TargetNotFoundError,
  type CameraViewLike,
  type HotspotInput,
  type SpecterHost,
} from "specter-core";
import type { OpRegistry, SpecContext } from "specter-voice";

/** A SpecterHost over an R3F scene, so the same Spec that drives a SpecterScene drives an R3F tree. */
export class R3FHost implements SpecterHost {
  readonly hotspots: HotspotManager;
  readonly materials: MaterialStore;
  readonly controls: { target: THREE.Vector3 } | null = { target: new THREE.Vector3() };
  private presets = new Map<string, CameraViewLike>();
  private overlay: HTMLDivElement;

  constructor(
    readonly modelSlot: THREE.Object3D,
    readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLElement,
  ) {
    const doc = canvas.ownerDocument;
    injectStyles(doc);
    const parent = canvas.parentElement ?? doc.body;
    if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
    this.overlay = doc.createElement("div");
    this.overlay.className = "specter-overlay";
    parent.appendChild(this.overlay);
    this.hotspots = new HotspotManager({ overlay: this.overlay, root: modelSlot, camera });
    this.materials = new MaterialStore(modelSlot);
  }

  registerCameraPresets(presets: Record<string, CameraViewLike>): void {
    this.presets = new Map(Object.entries(presets));
  }

  flyTo(view: CameraViewLike): void {
    this.camera.position.set(...view.position);
    this.controls?.target.set(...view.target);
    this.camera.lookAt(...view.target);
  }

  goTo(id: string): void {
    const v = this.presets.get(id);
    if (!v) throw new TargetNotFoundError(id, "camera");
    this.flyTo(v);
  }

  setMode(): void {
    /* camera paths are not part of the thin adapter */
  }

  getSpecContext(extra: Partial<SpecContext> & { app: string }): SpecContext {
    return {
      meshes: listTargets(this.modelSlot),
      hotspots: this.hotspots.list().map((h) => ({ id: h.id, mesh: h.mesh, title: h.title })),
      packs: [],
      cameraPresets: [...this.presets.keys()],
      ...extra,
    };
  }

  update(): void {
    this.hotspots.updateScreen(this.canvas.clientWidth, this.canvas.clientHeight);
  }

  destroy(): void {
    this.hotspots.destroy();
    this.materials.disposeRetired();
    this.overlay.remove();
  }
}

export interface SpecterBridgeProps {
  /** The group that holds the model. Specter ops may only touch objects inside it. */
  target: RefObject<THREE.Object3D | null>;
  hotspots?: HotspotInput[];
  /** Receives the host and a registry already bound to it. Use `registry.parseSpec` and `registry.apply(host, spec)`. */
  onReady?: (host: R3FHost, registry: OpRegistry<SpecterHost>) => void;
}

/** Place inside a Canvas. Wires hotspots and the Spec registry to an R3F object tree. Renders nothing itself. */
export function SpecterBridge({ target, hotspots, onReady }: SpecterBridgeProps) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const hostRef = useRef<R3FHost | null>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    const obj = target.current;
    if (!obj) return;
    const host = new R3FHost(obj, camera, gl.domElement);
    hostRef.current = host;
    for (const h of hotspots ?? []) {
      try {
        host.hotspots.add(h);
      } catch (e) {
        console.warn(`[specter-r3f] ${e instanceof Error ? e.message : e}`);
      }
    }
    readyRef.current?.(host, createSpecterRegistry());
    return () => {
      host.destroy();
      hostRef.current = null;
    };
    // the bridge is created once per mount; hotspots are applied at that time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl, target]);

  useFrame(() => hostRef.current?.update());
  return null;
}
