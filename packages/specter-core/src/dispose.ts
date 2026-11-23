import * as THREE from "three";

export interface DisposeStats {
  geometries: number;
  materials: number;
  textures: number;
}

const TEXTURE_KEYS = [
  "map",
  "lightMap",
  "bumpMap",
  "normalMap",
  "specularMap",
  "envMap",
  "alphaMap",
  "aoMap",
  "displacementMap",
  "emissiveMap",
  "gradientMap",
  "metalnessMap",
  "roughnessMap",
  "clearcoatMap",
  "clearcoatNormalMap",
  "clearcoatRoughnessMap",
  "sheenColorMap",
  "sheenRoughnessMap",
  "transmissionMap",
  "thicknessMap",
  "iridescenceMap",
  "anisotropyMap",
  "specularIntensityMap",
  "specularColorMap",
] as const;

export function disposeMaterial(material: THREE.Material, stats?: DisposeStats, seen?: Set<unknown>): void {
  if (seen?.has(material)) return;
  seen?.add(material);
  const record = material as unknown as Record<string, unknown>;
  for (const key of TEXTURE_KEYS) {
    const tex = record[key];
    if (tex instanceof THREE.Texture && !seen?.has(tex)) {
      seen?.add(tex);
      tex.dispose();
      if (stats) stats.textures++;
    }
  }
  material.dispose();
  if (stats) stats.materials++;
}

/**
 * Dispose every geometry, material and texture under an object and detach it from its parent.
 * Shared resources are disposed once. Safe to call twice.
 */
export function disposeObject3D(object: THREE.Object3D, opts: { detach?: boolean } = {}): DisposeStats {
  const stats: DisposeStats = { geometries: 0, materials: 0, textures: 0 };
  const seen = new Set<unknown>();
  object.traverse((child) => {
    const c = child as THREE.Mesh & THREE.Light;
    if (c.geometry && !seen.has(c.geometry)) {
      seen.add(c.geometry);
      c.geometry.dispose();
      stats.geometries++;
    }
    const mat = (c as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (mat) {
      if (Array.isArray(mat)) mat.forEach((m) => disposeMaterial(m, stats, seen));
      else disposeMaterial(mat, stats, seen);
    }
    const light = child as THREE.Light;
    if (light.isLight && (light as THREE.DirectionalLight).shadow?.map) {
      (light as THREE.DirectionalLight).shadow.map?.dispose();
    }
    // sprites, points and lines carry their own materials, handled above
  });
  if (opts.detach !== false) object.removeFromParent();
  return stats;
}
