import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { disposeObject3D } from "./dispose";

export type LightingPreset = "studio" | "indoor" | "night";

export interface LightingRig {
  group: THREE.Group;
  /** Shadow-casting key light, so callers can fit its frustum to the model. */
  key: THREE.DirectionalLight | null;
}

/** Build a lighting rig for a preset. The caller adds it to the scene root and disposes it with disposeObject3D. */
export function createLightingRig(preset: LightingPreset, shadows: boolean): LightingRig {
  const group = new THREE.Group();
  group.name = "specter-lights";
  group.userData.specterIgnore = true;
  let key: THREE.DirectionalLight | null = null;

  if (preset === "studio") {
    group.add(new THREE.HemisphereLight(0xdfe8ff, 0x20202a, 0.35));
    key = new THREE.DirectionalLight(0xfff1e0, 2.4);
    key.position.set(5, 8, 6);
    const fill = new THREE.DirectionalLight(0x9db8ff, 0.7);
    fill.position.set(-6, 3, 2);
    const rim = new THREE.DirectionalLight(0xff9d6b, 1.0);
    rim.position.set(-2, 4, -7);
    group.add(key, fill, rim);
  } else if (preset === "indoor") {
    group.add(new THREE.HemisphereLight(0xfff2de, 0x3a2f2a, 0.5));
    key = new THREE.DirectionalLight(0xffe8c8, 1.6);
    key.position.set(4, 7, 3);
    const warm = new THREE.PointLight(0xffb36b, 18, 14, 2);
    warm.position.set(0, 2.4, 0);
    group.add(key, warm);
  } else {
    group.add(new THREE.HemisphereLight(0x5568a8, 0x120a1a, 0.5));
    key = new THREE.DirectionalLight(0x9fb3ff, 1.1);
    key.position.set(-4, 7, 5);
    const ember = new THREE.PointLight(0xff7a3d, 14, 12, 2);
    ember.position.set(2, 1.6, 2);
    group.add(key, ember);
  }

  if (key) {
    key.castShadow = shadows;
    if (shadows) {
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.03;
      key.shadow.radius = 4;
      const cam = key.shadow.camera;
      cam.near = 0.5;
      cam.far = 60;
      cam.left = -12;
      cam.right = 12;
      cam.top = 12;
      cam.bottom = -12;
    }
  }
  return { group, key };
}

export interface EnvironmentHandle {
  texture: THREE.Texture;
  dispose(): void;
}

/** Procedural room environment: image-based lighting with zero downloads, so it works offline. */
export function createRoomEnvironment(renderer: THREE.WebGLRenderer): EnvironmentHandle {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const rt = pmrem.fromScene(room, 0.04);
  room.dispose();
  pmrem.dispose();
  return { texture: rt.texture, dispose: () => rt.dispose() };
}

/** Load an equirectangular .hdr file (for example a CC0 Poly Haven HDRI). Rejects on failure so callers can fall back. */
export async function loadHdriEnvironment(renderer: THREE.WebGLRenderer, url: string): Promise<EnvironmentHandle> {
  const tex = await new HDRLoader().loadAsync(url);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromEquirectangular(tex);
  tex.dispose();
  pmrem.dispose();
  return { texture: rt.texture, dispose: () => rt.dispose() };
}

export function disposeRig(rig: LightingRig | null): void {
  if (rig) disposeObject3D(rig.group);
}
