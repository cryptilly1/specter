import * as THREE from "three";
import type { SpecterScene } from "./scene";

export interface SplatHandle {
  /** The splat object, added under the scene's model slot. */
  object: THREE.Object3D;
  dispose(): void;
}

/** True when `url` exists and is not an HTML fallback page. Lets apps hide the scan scene when no asset was supplied. */
export async function assetExists(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    if (!r.ok) return false;
    const type = r.headers.get("content-type") ?? "";
    return !type.includes("text/html");
  } catch {
    return false;
  }
}

/**
 * Load a Gaussian splat scan (.spz, .ply, .splat, .ksplat) with Spark and show it in the scene.
 * Splats have no named meshes, so only position-anchored hotspots and camera paths apply to them.
 * Spark is imported on demand so the 3D apps do not pay for it until a scan is opened.
 * Throws if WebGL is unavailable or the file cannot be loaded; callers should fall back to the mesh scene.
 */
export async function loadSplatScene(scene: SpecterScene, url: string, opts: { position?: [number, number, number]; scale?: number; flipY?: boolean } = {}): Promise<SplatHandle> {
  if (!scene.renderer) throw new Error("Gaussian splats need a WebGL renderer");
  const { SparkRenderer, SplatMesh } = await import("@sparkjsdev/spark");
  // Spark post-processes splats itself; composer passes would sort them incorrectly.
  scene.setQuality("standard");
  const spark = new SparkRenderer({ renderer: scene.renderer });
  scene.scene.add(spark);
  const mesh = new SplatMesh({ url });
  if (opts.flipY !== false) mesh.quaternion.set(1, 0, 0, 0); // most scans are exported Y-down
  if (opts.position) mesh.position.set(...opts.position);
  if (opts.scale) mesh.scale.setScalar(opts.scale);
  const group = new THREE.Group();
  group.name = "splat_scene";
  group.add(mesh);
  try {
    await (mesh as unknown as { initialized: Promise<unknown> }).initialized;
  } catch (e) {
    scene.scene.remove(spark);
    throw new Error(`Could not load scan: ${e instanceof Error ? e.message : String(e)}`);
  }
  scene.setModel(group, { fit: false });
  // frame the scan: use Spark's bounds when available, otherwise keep the current view
  try {
    const box = (mesh as unknown as { getBoundingBox?: (centersOnly?: boolean) => THREE.Box3 }).getBoundingBox?.(true);
    if (box && !box.isEmpty()) {
      const b = box.clone().applyMatrix4(mesh.matrixWorld.clone().compose(mesh.position, mesh.quaternion, mesh.scale));
      const sphere = b.getBoundingSphere(new THREE.Sphere());
      const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(scene.camera.fov / 2))) * 1.1;
      const c = sphere.center;
      scene.setHome({ position: [c.x + dist * 0.35, c.y + dist * 0.15, c.z + dist * 0.9], target: [c.x, c.y, c.z] });
      scene.resetView();
    }
  } catch {
    /* framing is best effort */
  }
  return {
    object: group,
    dispose() {
      try {
        (mesh as unknown as { dispose?: () => void }).dispose?.();
      } catch {
        /* already disposed */
      }
      scene.scene.remove(spark);
    },
  };
}
