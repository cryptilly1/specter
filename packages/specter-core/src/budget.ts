import * as THREE from "three";

export interface Budget {
  triangles: number;
  drawCalls: number;
  maxTextureEdge: number;
  textureMegabytes: number;
}

export const DEFAULT_BUDGET: Budget = {
  triangles: 300_000,
  drawCalls: 200,
  maxTextureEdge: 2048,
  textureMegabytes: 128,
};

export interface SceneMetrics {
  triangles: number;
  drawCalls: number;
  maxTextureEdge: number;
  textureMegabytes: number;
  meshes: number;
}

const TEXTURE_PROPS = ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap", "alphaMap", "bumpMap", "lightMap"] as const;

export function measureScene(root: THREE.Object3D): SceneMetrics {
  let triangles = 0;
  let drawCalls = 0;
  let meshes = 0;
  let maxEdge = 0;
  let bytes = 0;
  const seen = new Set<THREE.Texture>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    meshes++;
    const geo = mesh.geometry;
    const index = geo.index;
    const count = index ? index.count : (geo.attributes.position?.count ?? 0);
    triangles += Math.floor(count / 3) * ((mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    drawCalls += Math.max(1, mats.length);
    for (const m of mats) {
      const rec = m as unknown as Record<string, unknown>;
      for (const p of TEXTURE_PROPS) {
        const t = rec[p];
        if (t instanceof THREE.Texture && !seen.has(t)) {
          seen.add(t);
          const img = t.image as { width?: number; height?: number } | undefined;
          const w = img?.width ?? 0;
          const h = img?.height ?? 0;
          maxEdge = Math.max(maxEdge, w, h);
          bytes += w * h * 4 * (t.generateMipmaps ? 1.33 : 1);
        }
      }
    }
  });
  return { triangles, drawCalls, maxTextureEdge: maxEdge, textureMegabytes: bytes / (1024 * 1024), meshes };
}

/** Returns human-readable warnings. Never throws: a budget overrun should warn, not break the demo. */
export function checkBudget(metrics: SceneMetrics, budget: Budget = DEFAULT_BUDGET): string[] {
  const w: string[] = [];
  if (metrics.triangles > budget.triangles) w.push(`Triangle count ${metrics.triangles.toLocaleString()} exceeds budget ${budget.triangles.toLocaleString()}`);
  if (metrics.drawCalls > budget.drawCalls) w.push(`Draw calls ${metrics.drawCalls} exceed budget ${budget.drawCalls}`);
  if (metrics.maxTextureEdge > budget.maxTextureEdge) w.push(`Largest texture edge ${metrics.maxTextureEdge}px exceeds ${budget.maxTextureEdge}px`);
  if (metrics.textureMegabytes > budget.textureMegabytes) w.push(`Texture memory ~${metrics.textureMegabytes.toFixed(0)} MB exceeds ${budget.textureMegabytes} MB`);
  return w;
}
