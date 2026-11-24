import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { ModelLoadError } from "./errors";

export interface LoadModelOptions {
  /** Where the Draco decoder lives (copy three/examples/jsm/libs/draco/gltf there). Default "/draco/". */
  dracoPath?: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Fail if loading takes longer than this. Default 20 s. */
  timeoutMs?: number;
  /** Relative file name -> absolute URL, for multi-file glTF whose textures live elsewhere (Poly Haven). */
  urlMap?: Record<string, string>;
  /** HEAD the URL first so a missing file fails fast instead of parsing an HTML fallback page. Default true. */
  preflight?: boolean;
}

let sharedGltf: GLTFLoader | null = null;
let sharedDracoPath = "";

function getLoader(dracoPath: string): GLTFLoader {
  if (sharedGltf && sharedDracoPath === dracoPath) return sharedGltf;
  const draco = new DRACOLoader();
  draco.setDecoderPath(dracoPath);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  sharedGltf = loader;
  sharedDracoPath = dracoPath;
  return loader;
}

export interface LoadedModel {
  object: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

/** Load a GLB/GLTF with Draco and Meshopt support. Throws ModelLoadError for any failure. */
export async function loadGltf(url: string, opts: LoadModelOptions = {}): Promise<LoadedModel> {
  if (opts.preflight !== false && typeof fetch !== "undefined") {
    try {
      const head = await fetch(url, { method: "HEAD", signal: opts.signal });
      const type = head.headers.get("content-type") ?? "";
      if (!head.ok || type.includes("text/html")) {
        const err = new ModelLoadError(url, new Error(`not found (${head.status})`));
        err.notFound = true;
        throw err;
      }
    } catch (e) {
      if (e instanceof ModelLoadError) throw e;
      throw new ModelLoadError(url, e);
    }
  }
  let loader = getLoader(opts.dracoPath ?? "/draco/");
  if (opts.urlMap && Object.keys(opts.urlMap).length) {
    const map = opts.urlMap;
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((u) => {
      for (const [rel, abs] of Object.entries(map)) {
        if (u === rel || u.endsWith(`/${rel}`) || decodeURIComponent(u).endsWith(`/${rel}`)) return abs;
      }
      return u;
    });
    const l = new GLTFLoader(manager);
    const draco = new DRACOLoader(manager);
    draco.setDecoderPath(opts.dracoPath ?? "/draco/");
    l.setDRACOLoader(draco);
    l.setMeshoptDecoder(MeshoptDecoder);
    loader = l;
  }
  const timeout = opts.timeoutMs ?? 20000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const load = loader.loadAsync(url, (e) => {
      if (e.lengthComputable && e.total > 0) opts.onProgress?.(e.loaded / e.total);
    });
    const timed = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${timeout} ms`)), timeout);
      opts.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
    const gltf = await Promise.race([load, timed]);
    return { object: gltf.scene, animations: gltf.animations };
  } catch (e) {
    throw new ModelLoadError(url, e);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
