import * as THREE from "three";

/** Small helpers for building named, procedural models (permanent fallbacks for GLBs). Standard PBR only. */
export function pbr(color: string | number, o: Partial<{ roughness: number; metalness: number; emissive: string | number; emissiveIntensity: number; opacity: number; side: THREE.Side }> = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: o.roughness ?? 0.55,
    metalness: o.metalness ?? 0.05,
    side: o.side ?? THREE.FrontSide,
  });
  if (o.emissive !== undefined) {
    m.emissive = new THREE.Color(o.emissive);
    m.emissiveIntensity = o.emissiveIntensity ?? 0.6;
  }
  if (o.opacity !== undefined && o.opacity < 1) {
    m.transparent = true;
    m.opacity = o.opacity;
    m.depthWrite = false;
  }
  return m;
}

/** Create a named mesh at a position. The name is what voice commands target. */
export function namedMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number] = [0, 0, 0],
  opts: { rotation?: [number, number, number]; scale?: [number, number, number]; castShadow?: boolean; receiveShadow?: boolean } = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  if (opts.rotation) mesh.rotation.set(...opts.rotation);
  if (opts.scale) mesh.scale.set(...opts.scale);
  mesh.castShadow = opts.castShadow ?? true;
  mesh.receiveShadow = opts.receiveShadow ?? true;
  return mesh;
}

/** Group with a name, so a set of meshes can be targeted together ("the sofa"). */
export function namedGroup(name: string, children: THREE.Object3D[], position: [number, number, number] = [0, 0, 0]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(...position);
  g.add(...children);
  return g;
}

/** A soft round contact shadow plate under a model. Marked specterIgnore so it is not a voice target. */
export function groundDisc(radius = 6, color: string | number = 0x15101f): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  m.name = "ground";
  m.userData.specterIgnore = true;
  m.userData.noShadow = false;
  return m;
}
