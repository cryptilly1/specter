import * as THREE from "three";
import { normalize } from "specter-voice";

/** Find an object by exact name, then by normalized name (case and separator insensitive). */
export function findByName(root: THREE.Object3D, name: string): THREE.Object3D | null {
  const exact = root.getObjectByName(name);
  if (exact) return exact;
  const want = normalize(name);
  let hit: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!hit && o.name && normalize(o.name) === want) hit = o;
  });
  return hit;
}

const IGNORED = /^(scene|root|sketchfab_model|rootnode|auxscene|object_\d+|mesh_?\d*|node_?\d*|group_?\d*|geometry_?\d*|cube(\.\d+)?|sphere(\.\d+)?|plane(\.\d+)?)$/i;

/**
 * List the names that voice/text may target. Includes named meshes and named groups that contain meshes.
 * Generic exporter names ("Object_12", "Sketchfab_model") are skipped because nobody would say them aloud.
 */
export function listTargets(root: THREE.Object3D): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  root.traverse((o) => {
    if (o === root || !o.name || o.userData?.specterIgnore) return;
    if (IGNORED.test(o.name)) return;
    const isMesh = (o as THREE.Mesh).isMesh === true;
    let hasMesh = isMesh;
    if (!isMesh && o.children.length) {
      o.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) hasMesh = true;
      });
    }
    if (!hasMesh) return;
    if (!seen.has(o.name)) {
      seen.add(o.name);
      out.push(o.name);
    }
  });
  return out;
}

/** All meshes in the subtree of `obj`, including `obj` itself when it is a mesh. */
export function meshesIn(obj: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  obj.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) meshes.push(c as THREE.Mesh);
  });
  return meshes;
}

export function worldCenter(obj: THREE.Object3D, out = new THREE.Vector3()): THREE.Vector3 {
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return obj.getWorldPosition(out);
  return box.getCenter(out);
}
