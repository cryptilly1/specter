import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { SpecContext } from "specter-voice";
import { checkBudget, measureScene, type Budget, type SceneMetrics, DEFAULT_BUDGET } from "./budget";
import { CameraPath, PathPlayer, type Keyframe, type PathPlayerEvents } from "./camera-path";
import { disposeObject3D } from "./dispose";
import { ModelLoadError, TargetNotFoundError } from "./errors";
import { findByName, listTargets } from "./find";
import { HotspotManager, injectStyles, type Hotspot } from "./hotspots";
import { createLightingRig, createRoomEnvironment, disposeRig, loadHdriEnvironment, type EnvironmentHandle, type LightingPreset, type LightingRig } from "./lighting";
import { loadGltf, type LoadModelOptions } from "./loader";
import { MaterialStore } from "./materials";

export type Quality = "standard" | "cinematic";

export interface CameraView {
  position: [number, number, number];
  target: [number, number, number];
}

export interface SpecterSceneOptions {
  lighting?: LightingPreset;
  /** "cinematic" adds ambient occlusion and a subtle bloom. Default: cinematic on desktop, standard on touch devices. */
  quality?: Quality;
  /** CSS color, or a [top, bottom] pair for a vertical gradient. */
  background?: string | [string, string];
  /** Optional equirectangular .hdr URL (for example CC0 from Poly Haven). Falls back to the built-in room environment. */
  hdri?: string | null;
  /** Skip WebGL entirely (tests, SSR). The scene graph, hotspots and ops still work. */
  headless?: boolean;
  controls?: boolean;
  hotspotPanel?: boolean;
  readAloud?: boolean;
  dracoPath?: string;
  view?: CameraView;
  fov?: number;
  autoRotate?: boolean;
  budget?: Budget;
  lang?: () => string;
  onError?: (message: string) => void;
  onWarning?: (messages: string[]) => void;
  onHotspotSelect?: (h: Hotspot | null) => void;
}

export interface LoadResult {
  source: "gltf" | "fallback";
  error?: string;
}

interface Tween {
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toPos: THREE.Vector3;
  toTarget: THREE.Vector3;
  elapsed: number;
  duration: number;
}

const isTouch = () => typeof window !== "undefined" && ("ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0);

/**
 * The Specter scene: renderer, camera, controls, lighting, model slot, hotspots, materials and camera paths.
 * Everything lives under `root`. `destroy()` frees all GPU resources.
 */
export class SpecterScene {
  readonly container: HTMLElement;
  readonly overlay: HTMLDivElement;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly root = new THREE.Group();
  readonly modelSlot = new THREE.Group();
  readonly renderer: THREE.WebGLRenderer | null;
  readonly controls: OrbitControls | null;
  readonly hotspots: HotspotManager;
  readonly materials: MaterialStore;
  readonly headless: boolean;

  private opts: SpecterSceneOptions;
  private rig: LightingRig | null = null;
  private env: EnvironmentHandle | null = null;
  private bgTexture: THREE.Texture | null = null;
  private composer: EffectComposer | null = null;
  private quality: Quality = "standard";
  private lighting: LightingPreset;
  private raf = 0;
  private lastTime = 0;
  private frameCbs = new Set<(dt: number) => void>();
  private presets = new Map<string, CameraView>();
  private tween: Tween | null = null;
  private player: PathPlayer | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private resizeObs: ResizeObserver | null = null;
  private loadingEl: HTMLDivElement;
  private toastEl: HTMLDivElement | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;
  private visible = true;
  private io: IntersectionObserver | null = null;
  private modelToken = 0;
  private raycaster = new THREE.Raycaster();
  private pointerDown: { x: number; y: number; t: number } | null = null;
  private width = 1;
  private height = 1;
  private home: CameraView;
  private cleanups: (() => void)[] = [];
  private pickHandlers = new Set<(hit: THREE.Object3D | null, e: PointerEvent) => boolean | void>();
  private hoverHandlers = new Set<(hit: THREE.Object3D | null) => void>();
  private lastHover: THREE.Object3D | null = null;
  private hoverPending = false;
  private extraEnv: EnvironmentHandle | null = null;
  /** Loaded model animations, if any. */
  animations: THREE.AnimationClip[] = [];

  constructor(container: HTMLElement, opts: SpecterSceneOptions = {}) {
    this.container = container;
    this.opts = opts;
    this.headless = opts.headless === true;
    this.lighting = opts.lighting ?? "studio";
    const doc = container.ownerDocument;
    injectStyles(doc);
    container.classList.add("specter-root");

    this.root.name = "specter-root";
    this.modelSlot.name = "specter-model";
    this.root.add(this.modelSlot);
    this.scene.add(this.root);

    const v = opts.view ?? { position: [4, 3, 6], target: [0, 0.8, 0] };
    this.home = v;
    this.camera = new THREE.PerspectiveCamera(opts.fov ?? 45, 1, 0.05, 400);
    this.camera.position.set(...v.position);

    // renderer
    if (this.headless) {
      this.renderer = null;
      this.controls = null;
    } else {
      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.85;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      container.appendChild(renderer.domElement);
      renderer.domElement.setAttribute("role", "img");
      renderer.domElement.setAttribute("aria-label", "Interactive 3D scene. Drag to orbit, scroll to zoom.");
      this.renderer = renderer;

      if (opts.controls !== false) {
        const controls = new OrbitControls(this.camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.target.set(...v.target);
        controls.maxPolarAngle = Math.PI * 0.495;
        controls.minDistance = 0.4;
        controls.maxDistance = 120;
        controls.autoRotate = opts.autoRotate === true;
        controls.autoRotateSpeed = 0.6;
        this.controls = controls;
      } else {
        this.controls = null;
      }
    }
    this.camera.lookAt(...v.target);

    // overlay (hotspot markers, panel, loading, toasts)
    this.overlay = doc.createElement("div");
    this.overlay.className = "specter-overlay";
    container.appendChild(this.overlay);
    this.loadingEl = doc.createElement("div");
    this.loadingEl.className = "specter-loading";
    this.loadingEl.setAttribute("role", "status");
    this.loadingEl.hidden = true;
    this.overlay.appendChild(this.loadingEl);

    this.hotspots = new HotspotManager({
      overlay: this.overlay,
      root: this.modelSlot,
      camera: this.camera,
      panel: opts.hotspotPanel,
      readAloud: opts.readAloud,
      lang: opts.lang,
      onSelect: opts.onHotspotSelect,
    });
    this.materials = new MaterialStore(this.modelSlot);

    this.setBackground(opts.background ?? ["#241a3a", "#0b0813"]);
    this.applyLighting(this.lighting);
    this.quality = opts.quality ?? (isTouch() ? "standard" : "cinematic");

    if (this.renderer) {
      void this.initEnvironment();
      this.setQuality(this.quality);
      this.bindPointer();
      this.resizeObs = new ResizeObserver(() => this.resize());
      this.resizeObs.observe(container);
      if (typeof IntersectionObserver !== "undefined") {
        this.io = new IntersectionObserver((entries) => {
          this.visible = entries.some((e) => e.isIntersecting);
        });
        this.io.observe(container);
      }
      const onVis = () => {
        if (!document.hidden) this.lastTime = performance.now();
      };
      document.addEventListener("visibilitychange", onVis);
      this.cleanups.push(() => document.removeEventListener("visibilitychange", onVis));
      this.resize();
      this.lastTime = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  // ---------- environment, lighting, quality ----------

  private async initEnvironment(): Promise<void> {
    if (!this.renderer) return;
    try {
      if (this.opts.hdri) {
        try {
          this.env = await loadHdriEnvironment(this.renderer, this.opts.hdri);
        } catch {
          this.env = createRoomEnvironment(this.renderer);
        }
      } else {
        this.env = createRoomEnvironment(this.renderer);
      }
      if (this.destroyed) {
        this.env.dispose();
        this.env = null;
        return;
      }
      this.scene.environment = this.env.texture;
      this.applyEnvIntensity();
    } catch (e) {
      this.warn([`Environment lighting unavailable: ${e instanceof Error ? e.message : String(e)}`]);
    }
  }

  private applyEnvIntensity(): void {
    this.scene.environmentIntensity = this.lighting === "night" ? 0.35 : this.lighting === "indoor" ? 0.7 : this.lighting === "sunset" ? 0.6 : this.lighting === "daylight" ? 1.0 : 0.9;
  }

  setBackground(bg: string | [string, string]): void {
    this.bgTexture?.dispose();
    this.bgTexture = null;
    if (Array.isArray(bg) && this.headless) {
      this.scene.background = new THREE.Color(bg[1]);
      return;
    }
    if (Array.isArray(bg)) {
      const c = document.createElement("canvas");
      c.width = 4;
      c.height = 256;
      const g = c.getContext("2d");
      if (g) {
        const grad = g.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, bg[0]);
        grad.addColorStop(1, bg[1]);
        g.fillStyle = grad;
        g.fillRect(0, 0, 4, 256);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        this.bgTexture = tex;
        this.scene.background = tex;
        return;
      }
      this.scene.background = new THREE.Color(bg[1]);
      return;
    }
    this.scene.background = new THREE.Color(bg);
  }

  applyLighting(preset: LightingPreset): void {
    this.lighting = preset;
    if (this.rig) {
      disposeRig(this.rig);
      this.rig = null;
    }
    this.rig = createLightingRig(preset, !this.headless);
    this.root.add(this.rig.group);
    this.applyEnvIntensity();
  }

  getLighting(): LightingPreset {
    return this.lighting;
  }

  getQuality(): Quality {
    return this.quality;
  }

  setQuality(q: Quality): void {
    this.quality = q;
    if (!this.renderer) return;
    this.composer?.dispose();
    this.composer = null;
    if (q === "cinematic") {
      try {
        const size = new THREE.Vector2();
        this.renderer.getSize(size);
        const composer = new EffectComposer(this.renderer);
        composer.addPass(new RenderPass(this.scene, this.camera));
        const gtao = new GTAOPass(this.scene, this.camera, size.x || 512, size.y || 512);
        gtao.output = GTAOPass.OUTPUT.Default;
        composer.addPass(gtao);
        composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x || 512, size.y || 512), 0.14, 0.6, 1.8));
        composer.addPass(new OutputPass());
        this.composer = composer;
        this.resize();
      } catch (e) {
        this.quality = "standard";
        this.composer = null;
        this.warn([`Cinematic quality unavailable, using standard: ${e instanceof Error ? e.message : String(e)}`]);
      }
    }
  }

  // ---------- model ----------

  /** Replace the current model. The old one is fully disposed. Hotspots are kept and re-anchored. */
  setModel(object: THREE.Object3D, o: { fit?: boolean; animations?: THREE.AnimationClip[] } = {}): void {
    this.modelToken++;
    this.clearModel();
    object.name = object.name || "model";
    this.modelSlot.add(object);
    object.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        const transparent = mats.some((x) => x.transparent && x.opacity < 0.9);
        m.castShadow = !transparent && m.userData.noShadow !== true;
        m.receiveShadow = m.userData.noShadow !== true;
      }
    });
    this.animations = o.animations ?? [];
    if (this.animations.length) {
      this.mixer = new THREE.AnimationMixer(object);
      this.animations.forEach((clip) => this.mixer!.clipAction(clip).play());
    }
    this.fitShadowToModel();
    if (o.fit !== false) this.fitCameraToModel();
    this.hotspots.refreshAnchors();
    this.checkBudgetNow();
  }

  clearModel(): void {
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.materials.disposeRetired();
    for (const child of [...this.modelSlot.children]) disposeObject3D(child);
  }

  /**
   * Load a GLB. On any failure the fallback factory builds a procedural model instead, a toast explains why,
   * and `onError` is called. The scene never ends up empty.
   */
  async loadModel(url: string, o: { fallback?: () => THREE.Object3D; fit?: boolean; loader?: LoadModelOptions } = {}): Promise<LoadResult> {
    const token = ++this.modelToken;
    this.showLoading("Loading model…");
    try {
      const loaded = await loadGltf(url, {
        dracoPath: this.opts.dracoPath,
        ...o.loader,
        onProgress: (f) => this.showLoading(`Loading model… ${Math.round(f * 100)}%`),
      });
      if (token !== this.modelToken || this.destroyed) {
        disposeObject3D(loaded.object);
        return { source: "gltf" };
      }
      this.setModel(loaded.object, { fit: o.fit, animations: loaded.animations });
      this.modelToken = token;
      this.hideLoading();
      return { source: "gltf" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const quiet = e instanceof ModelLoadError && e.notFound;
      if (!quiet) this.opts.onError?.(msg);
      this.hideLoading();
      if (o.fallback && !this.destroyed && token === this.modelToken) {
        this.setModel(o.fallback(), { fit: o.fit });
        this.modelToken = token;
        if (!quiet) this.toast("Couldn't load the 3D model. Showing a simplified version.");
        return { source: "fallback", error: msg };
      }
      this.toast("Couldn't load the 3D model.");
      return { source: "fallback", error: msg };
    }
  }

  getMetrics(): SceneMetrics {
    return measureScene(this.modelSlot);
  }

  private checkBudgetNow(): void {
    const warnings = checkBudget(this.getMetrics(), this.opts.budget ?? DEFAULT_BUDGET);
    if (warnings.length) this.warn(warnings);
  }

  private warn(messages: string[]): void {
    this.opts.onWarning?.(messages);
  }

  // ---------- camera ----------

  /** A view that frames everything in the model slot, or null when it is empty. */
  frameView(padding = 1.4): CameraView | null {
    const box = new THREE.Box3().setFromObject(this.modelSlot);
    if (box.isEmpty()) return null;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * padding;
    const dir = new THREE.Vector3(0.6, 0.45, 1).normalize();
    const pos = sphere.center.clone().add(dir.multiplyScalar(dist));
    return { position: [pos.x, pos.y, pos.z], target: [sphere.center.x, sphere.center.y, sphere.center.z] };
  }

  fitCameraToModel(seconds = 0, padding = 1.4): void {
    const view = this.frameView(padding);
    if (!view) return;
    const pos = new THREE.Vector3(...view.position);
    const sphere = { center: new THREE.Vector3(...view.target) };
    this.home = view;
    if (seconds > 0 && !this.headless) return this.flyTo(this.home, seconds);
    this.camera.position.copy(pos);
    this.camera.lookAt(sphere.center);
    this.controls?.target.copy(sphere.center);
    this.controls?.update();
  }

  /** Fit the shadow camera to the model so shadows stay sharp for small and large models. */
  private fitShadowToModel(): void {
    const key = this.rig?.key;
    if (!key || !key.castShadow) return;
    const box = new THREE.Box3().setFromObject(this.modelSlot);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const r = Math.max(2, sphere.radius * 1.15);
    const cam = key.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.far = r * 8;
    cam.updateProjectionMatrix();
    const dir = key.position.clone().normalize();
    key.position.copy(sphere.center).add(dir.multiplyScalar(r * 3));
    key.target.position.copy(sphere.center);
    key.target.updateMatrixWorld();
    this.root.add(key.target);
  }

  registerCameraPresets(presets: Record<string, CameraView>): void {
    this.presets.clear();
    for (const [k, v] of Object.entries(presets)) this.presets.set(k, v);
  }

  getCameraPresetIds(): string[] {
    const ids = new Set<string>(this.presets.keys());
    this.player?.path.keyframes.forEach((k) => k.id && ids.add(k.id));
    return [...ids];
  }

  /** Smoothly move the camera. Stops any playing path. */
  flyTo(view: CameraView, seconds = 1.4): void {
    this.player?.pause();
    this.tween = {
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls ? this.controls.target.clone() : new THREE.Vector3(...view.target),
      toPos: new THREE.Vector3(...view.position),
      toTarget: new THREE.Vector3(...view.target),
      elapsed: 0,
      duration: Math.max(0.01, seconds),
    };
    if (this.headless || seconds <= 0) {
      this.camera.position.copy(this.tween.toPos);
      this.controls?.target.copy(this.tween.toTarget);
      this.tween = null;
    }
  }

  /** Go to a named preset or a path keyframe id. Throws TargetNotFoundError when neither exists. */
  goTo(id: string, seconds?: number): void {
    const preset = this.presets.get(id);
    if (preset) return this.flyTo(preset, seconds);
    if (this.player?.path.timeOf(id) != null) {
      this.player.jumpTo(id, seconds ?? 1.8);
      return;
    }
    throw new TargetNotFoundError(id, "camera");
  }

  resetView(): void {
    this.flyTo(this.home, 1.0);
  }

  /** The home view (the framing after the last model fit or `setHome`). */
  getHome(): CameraView {
    return this.home;
  }

  setHome(view: CameraView): void {
    this.home = view;
  }

  /** Fly the camera so a named mesh or group fills the view, keeping the current viewing direction. */
  focusMesh(name: string, closeness = 2.2, seconds = 1.1): void {
    const obj = findByName(this.modelSlot, name);
    if (!obj) throw new TargetNotFoundError(name, "mesh");
    const sphere = new THREE.Box3().setFromObject(obj).getBoundingSphere(new THREE.Sphere());
    const target = sphere.center.clone();
    const dist = Math.max(0.8, (sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * closeness * 0.55);
    const from = this.controls?.target ?? new THREE.Vector3();
    const dir = this.camera.position.clone().sub(from);
    if (dir.lengthSq() < 1e-6) dir.set(0.4, 0.3, 1);
    dir.normalize().multiplyScalar(dist);
    const pos = target.clone().add(dir);
    this.flyTo({ position: [pos.x, pos.y, pos.z], target: [target.x, target.y, target.z] }, seconds);
  }

  /** Install a camera path. The previous one is replaced. */
  setPath(keyframes: Keyframe[], events: PathPlayerEvents = {}, loop = false): PathPlayer {
    this.player?.dispose();
    const path = new CameraPath(keyframes); // validates, throws InvalidPathError
    this.player = new PathPlayer(
      path,
      {
        camera: this.camera,
        controlsTarget: this.controls?.target ?? new THREE.Vector3(),
        setControlsEnabled: (e) => {
          if (this.controls) this.controls.enabled = e;
        },
      },
      events,
      loop,
    );
    return this.player;
  }

  get pathPlayer(): PathPlayer | null {
    return this.player;
  }

  setMode(mode: "orbit" | "path"): void {
    if (mode === "orbit") this.player?.pause();
    else if (this.player) this.player.play();
    else throw new TargetNotFoundError("camera path", "camera");
  }

  // ---------- frame loop ----------

  onFrame(cb: (dt: number) => void): () => void {
    this.frameCbs.add(cb);
    return () => this.frameCbs.delete(cb);
  }

  private loop = (): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (document.hidden || !this.visible) return;
    this.step(dt);
    this.render();
  };

  /** Advance time-dependent state. Exposed for tests and headless use. */
  step(dt: number): void {
    if (this.tween) {
      const t = this.tween;
      t.elapsed += dt;
      const s = Math.min(1, t.elapsed / t.duration);
      const e = s * s * (3 - 2 * s);
      this.camera.position.lerpVectors(t.fromPos, t.toPos, e);
      const tgt = new THREE.Vector3().lerpVectors(t.fromTarget, t.toTarget, e);
      this.controls?.target.copy(tgt);
      if (!this.controls) this.camera.lookAt(tgt);
      if (s >= 1) this.tween = null;
    }
    this.player?.update(dt);
    this.mixer?.update(dt);
    this.controls?.update();
    for (const cb of this.frameCbs) cb(dt);
    this.hotspots.updateScreen(this.width, this.height);
  }

  render(): void {
    if (!this.renderer) return;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.width = w;
    this.height = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.renderer) {
      this.renderer.setSize(w, h, false);
      this.composer?.setSize(w, h);
    }
  }

  // ---------- picking ----------

  private bindPointer(): void {
    const el = this.renderer!.domElement;
    const down = (e: PointerEvent) => {
      this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const up = (e: PointerEvent) => {
      const d = this.pointerDown;
      this.pointerDown = null;
      if (!d) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 600) return;
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hits = this.raycaster.intersectObjects(this.modelSlot.children, true).filter((h) => {
        for (let o: THREE.Object3D | null = h.object; o; o = o.parent) if (!o.visible) return false;
        return true;
      });
      for (const handler of this.pickHandlers) {
        if (handler(hits[0]?.object ?? null, e) === true) return;
      }
      for (const h of hits) {
        const id = this.hotspots.pickByObject(h.object);
        if (id) {
          this.hotspots.select(id);
          return;
        }
      }
    };
    const move = (e: PointerEvent) => {
      if (!this.hoverHandlers.size || this.hoverPending || e.buttons) return;
      this.hoverPending = true;
      requestAnimationFrame(() => {
        this.hoverPending = false;
        const hit = this.pickAt(e.clientX, e.clientY);
        if (hit === this.lastHover) return;
        this.lastHover = hit;
        for (const h of this.hoverHandlers) h(hit);
      });
    };
    const leave = () => {
      if (this.lastHover) {
        this.lastHover = null;
        for (const h of this.hoverHandlers) h(null);
      }
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    this.cleanups.push(() => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    });
  }

  /** First visible model object under a screen point, or null. */
  pickAt(clientX: number, clientY: number): THREE.Object3D | null {
    if (!this.renderer) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.modelSlot.children, true).filter((h) => {
      if (h.object.userData.editorOnly && !this.modelSlot.userData.editMode) return false;
      for (let o: THREE.Object3D | null = h.object; o; o = o.parent) if (!o.visible) return false;
      return true;
    });
    return hits[0]?.object ?? null;
  }

  /** Called on a click (not a drag) with the first object hit. Return true to stop hotspot handling. */
  onPick(fn: (hit: THREE.Object3D | null, e: PointerEvent) => boolean | void): () => void {
    this.pickHandlers.add(fn);
    return () => this.pickHandlers.delete(fn);
  }

  onHover(fn: (hit: THREE.Object3D | null) => void): () => void {
    this.hoverHandlers.add(fn);
    return () => this.hoverHandlers.delete(fn);
  }

  /** Use a loaded HDRI as lighting (and optionally as the visible sky). Pass null to go back to the built-in room. */
  setEnvironmentTexture(handle: EnvironmentHandle | null, asBackground = false): void {
    this.extraEnv?.dispose();
    this.extraEnv = handle;
    if (handle) {
      this.scene.environment = handle.texture;
      if (asBackground) this.scene.background = handle.texture;
    } else {
      this.scene.environment = this.env?.texture ?? null;
    }
  }

  // ---------- ui helpers ----------

  showLoading(text: string): void {
    this.loadingEl.replaceChildren();
    const spinner = this.container.ownerDocument.createElement("div");
    spinner.className = "specter-spinner";
    const label = this.container.ownerDocument.createElement("div");
    label.textContent = text;
    this.loadingEl.append(spinner, label);
    this.loadingEl.hidden = false;
  }

  hideLoading(): void {
    this.loadingEl.hidden = true;
  }

  toast(message: string, ms = 4500): void {
    this.toastEl?.remove();
    const el = this.container.ownerDocument.createElement("div");
    el.className = "specter-toast";
    el.setAttribute("role", "status");
    el.textContent = message;
    this.overlay.appendChild(el);
    this.toastEl = el;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.remove(), ms);
  }

  // ---------- spec context ----------

  /** Describe what is in the scene so the LLM prompt and the local parser only reference real targets. */
  getSpecContext(extra: Partial<SpecContext> & { app: string }): SpecContext {
    return {
      meshes: listTargets(this.modelSlot),
      hotspots: this.hotspots.list().map((h) => ({ id: h.id, mesh: h.mesh, title: h.title })),
      packs: [],
      cameraPresets: this.getCameraPresetIds(),
      ...extra,
    };
  }

  // ---------- teardown ----------

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.toastTimer);
    this.resizeObs?.disconnect();
    this.io?.disconnect();
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    this.player?.dispose();
    this.hotspots.destroy();
    this.clearModel();
    disposeRig(this.rig);
    this.rig = null;
    this.bgTexture?.dispose();
    this.env?.dispose();
    this.env = null;
    this.extraEnv?.dispose();
    this.extraEnv = null;
    this.pickHandlers.clear();
    this.hoverHandlers.clear();
    this.scene.environment = null;
    this.scene.background = null;
    this.composer?.dispose();
    this.composer = null;
    this.controls?.dispose();
    disposeObject3D(this.root);
    this.overlay.remove();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
    }
    this.container.classList.remove("specter-root");
    this.frameCbs.clear();
  }
}

export function createSpecterScene(container: HTMLElement, opts: SpecterSceneOptions = {}): SpecterScene {
  return new SpecterScene(container, opts);
}
