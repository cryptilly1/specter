import { BoxGeometry, Group, Object3D } from "three";
import { createSpecterRegistry, createSpecterScene, namedMesh, pbr, type LightingPreset, type Quality, type SpecterHost, type SpecterScene } from "specter-core";
import { decodeSpec, type OpRegistry, type Spec } from "specter-voice";

interface HotspotAttr {
  id?: string;
  mesh?: string;
  position?: [number, number, number];
  title: string;
  body: string;
}

const OBSERVED = ["src", "spec", "hotspots", "lighting", "quality", "background", "auto-rotate", "draco-path"] as const;

function placeholder(): Object3D {
  const g = new Group();
  g.name = "placeholder";
  g.add(namedMesh("block", new BoxGeometry(1.4, 1.4, 1.4), pbr("#8b5cf6", { roughness: 0.4 }), [0, 0.7, 0]));
  return g;
}

/**
 * <specter-viewer src="model.glb" hotspots='[{"mesh":"door","title":"Door","body":"..."}]' spec="<base64url or JSON>">
 *
 * Attributes: src, spec, hotspots, lighting (studio|indoor|night), quality (standard|cinematic), background (CSS color),
 * auto-rotate, draco-path. Events: `specter-ready`, `specter-error`, `specter-select`.
 * Methods: `applySpec(spec)`, property `scene`.
 */
export class SpecterViewerElement extends HTMLElement {
  static get observedAttributes() {
    return [...OBSERVED];
  }

  scene: SpecterScene | null = null;
  private host: HTMLDivElement | null = null;
  private registry: OpRegistry<SpecterHost> = createSpecterRegistry();
  private loadToken = 0;

  connectedCallback() {
    if (this.scene) return;
    if (!this.style.display) this.style.display = "block";
    if (!this.style.minHeight && !this.style.height) this.style.minHeight = "320px";
    this.style.position = this.style.position || "relative";
    this.host = document.createElement("div");
    this.host.style.cssText = "position:absolute;inset:0";
    this.appendChild(this.host);

    const quality = this.getAttribute("quality") as Quality | null;
    this.scene = createSpecterScene(this.host, {
      lighting: (this.getAttribute("lighting") as LightingPreset | null) ?? "studio",
      quality: quality === "cinematic" || quality === "standard" ? quality : undefined,
      background: this.getAttribute("background") ?? ["#241a3a", "#0b0813"],
      autoRotate: this.hasAttribute("auto-rotate"),
      dracoPath: this.getAttribute("draco-path") ?? undefined,
      onError: (m) => this.dispatchEvent(new CustomEvent("specter-error", { detail: m })),
      onHotspotSelect: (h) => this.dispatchEvent(new CustomEvent("specter-select", { detail: h })),
    });
    void this.reload();
  }

  disconnectedCallback() {
    this.loadToken++;
    this.scene?.destroy();
    this.scene = null;
    this.host?.remove();
    this.host = null;
  }

  attributeChangedCallback(name: string, oldValue: string | null, value: string | null) {
    if (!this.scene || oldValue === value) return;
    if (name === "src") void this.reload();
    else if (name === "hotspots" || name === "spec") void this.applyAttributes();
    else if (name === "lighting" && value) this.scene.applyLighting(value as LightingPreset);
    else if (name === "quality" && (value === "cinematic" || value === "standard")) this.scene.setQuality(value);
    else if (name === "background" && value) this.scene.setBackground(value);
  }

  /** Apply a Spec (object, JSON string or base64url share string). Unknown ops and targets are rejected. */
  async applySpec(input: Spec | string): Promise<{ ok: boolean; errors: string[] }> {
    const scene = this.scene;
    if (!scene) return { ok: false, errors: ["Viewer is not connected"] };
    let raw: unknown = input;
    if (typeof input === "string") {
      try {
        raw = JSON.parse(input);
      } catch {
        const d = decodeSpec(input, this.registry, scene.getSpecContext({ app: "specter-viewer" }));
        if (!d.ok) return { ok: false, errors: d.errors };
        raw = d.spec;
      }
    }
    const parsed = this.registry.parseSpec(raw, scene.getSpecContext({ app: "specter-viewer" }));
    if (!parsed.ok) return { ok: false, errors: parsed.errors };
    try {
      await this.registry.apply(scene, parsed.spec);
      return { ok: true, errors: [] };
    } catch (e) {
      return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
    }
  }

  private async reload() {
    const scene = this.scene;
    if (!scene) return;
    const token = ++this.loadToken;
    const src = this.getAttribute("src");
    if (src) await scene.loadModel(src, { fallback: placeholder });
    else scene.setModel(placeholder());
    if (token !== this.loadToken || !this.scene) return;
    await this.applyAttributes();
    this.dispatchEvent(new CustomEvent("specter-ready", { detail: { meshes: scene.getSpecContext({ app: "specter-viewer" }).meshes } }));
  }

  private async applyAttributes() {
    const scene = this.scene;
    if (!scene) return;
    scene.hotspots.clear();
    const raw = this.getAttribute("hotspots");
    if (raw) {
      try {
        const list = JSON.parse(raw) as HotspotAttr[];
        list.forEach((h, i) => {
          try {
            scene.hotspots.add({ id: h.id ?? `hs-${i}`, mesh: h.mesh, position: h.position, title: h.title, body: h.body });
          } catch (e) {
            this.dispatchEvent(new CustomEvent("specter-error", { detail: e instanceof Error ? e.message : String(e) }));
          }
        });
      } catch {
        this.dispatchEvent(new CustomEvent("specter-error", { detail: "hotspots attribute is not valid JSON" }));
      }
    }
    const spec = this.getAttribute("spec");
    if (spec) {
      const r = await this.applySpec(spec);
      if (!r.ok) this.dispatchEvent(new CustomEvent("specter-error", { detail: r.errors.join("; ") }));
    }
  }
}

export function defineSpecterViewer(tag = "specter-viewer"): void {
  if (typeof customElements !== "undefined" && !customElements.get(tag)) customElements.define(tag, SpecterViewerElement);
}
