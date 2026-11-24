import * as THREE from "three";
import { createSpeaker, isSpeechOutputSupported, type Speaker } from "specter-voice";
import { TargetNotFoundError } from "./errors";
import { findByName, worldCenter } from "./find";

export interface HotspotInput {
  id: string;
  kind?: "hotspot" | "note";
  /** Named mesh or group to anchor to. */
  mesh?: string;
  /** World position to anchor to when no mesh is given. */
  position?: [number, number, number];
  /** World-space offset added to a mesh anchor, to keep markers from overlapping. */
  offset?: [number, number, number];
  title: string;
  body: string;
}

export interface Hotspot extends HotspotInput {
  kind: "hotspot" | "note";
}

const STYLE_ID = "specter-core-styles";
const CSS = `
.specter-root{position:relative;overflow:hidden;width:100%;height:100%;touch-action:none}
.specter-root canvas{display:block;width:100%;height:100%;outline:none}
.specter-overlay{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.specter-marker{position:absolute;left:0;top:0;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;border:2px solid #fff;background:radial-gradient(circle at 35% 30%,#ffb86b,#ff6b3d 70%);box-shadow:0 0 0 0 rgba(255,140,60,.55),0 2px 10px rgba(0,0,0,.45);cursor:pointer;pointer-events:auto;padding:0;font:600 12px/1 system-ui,sans-serif;color:#2b1200;animation:specter-pulse 2.2s infinite;transform:translate(var(--sx,0px),var(--sy,0px));transition:opacity .2s,scale .12s}
.specter-marker[data-kind="note"]{border-radius:6px;background:linear-gradient(160deg,#fff4a8,#ffd54a);animation:none;box-shadow:0 2px 8px rgba(0,0,0,.4)}
.specter-marker:hover,.specter-marker:focus-visible{scale:1.18}
.specter-marker:focus-visible{outline:3px solid #8ab4ff;outline-offset:2px}
.specter-marker[data-active="true"]{background:radial-gradient(circle at 35% 30%,#fff,#ffd27a 70%);animation:none}
.specter-marker[data-hidden="true"]{opacity:0;pointer-events:none}
@keyframes specter-pulse{0%{box-shadow:0 0 0 0 rgba(255,140,60,.55),0 2px 10px rgba(0,0,0,.45)}70%{box-shadow:0 0 0 14px rgba(255,140,60,0),0 2px 10px rgba(0,0,0,.45)}100%{box-shadow:0 0 0 0 rgba(255,140,60,0),0 2px 10px rgba(0,0,0,.45)}}
@media (prefers-reduced-motion:reduce){.specter-marker{animation:none}}
.specter-panel{position:absolute;left:16px;top:16px;max-width:min(380px,calc(100% - 32px));padding:14px 16px 14px;border-radius:14px;background:rgba(18,14,28,.92);color:#f3eefc;box-shadow:0 10px 40px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.12);pointer-events:auto;font:14px/1.5 system-ui,-apple-system,sans-serif;backdrop-filter:blur(8px)}
.specter-panel[hidden]{display:none}
.specter-panel h3{margin:0 28px 6px 0;font-size:16px;font-weight:650}
.specter-panel p{margin:0 0 10px;color:#d9d0ec}
.specter-panel .specter-actions{display:flex;gap:8px}
.specter-panel button{font:inherit;color:inherit;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:5px 10px;cursor:pointer}
.specter-panel button:hover{background:rgba(255,255,255,.18)}
.specter-panel button:focus-visible{outline:3px solid #8ab4ff;outline-offset:2px}
.specter-panel .specter-close{position:absolute;right:8px;top:8px;width:28px;height:28px;padding:0;line-height:1}
.specter-loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(10,8,18,.72);color:#eee;font:15px system-ui;pointer-events:none;transition:opacity .3s}
.specter-loading[hidden]{display:none}
.specter-spinner{width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.2);border-top-color:#ff8a4c;animation:specter-spin 1s linear infinite}
@keyframes specter-spin{to{transform:rotate(360deg)}}
.specter-toast{position:absolute;top:12px;left:50%;transform:translateX(-50%);padding:8px 14px;border-radius:10px;background:rgba(60,30,20,.92);color:#ffe3d6;font:13px system-ui;pointer-events:none;max-width:90%}
`;

export function injectStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

interface Entry {
  data: Hotspot;
  el: HTMLButtonElement;
  anchor: THREE.Vector3;
}

export interface HotspotManagerOptions {
  overlay: HTMLElement;
  root: THREE.Object3D;
  camera: THREE.Camera;
  /** Built-in info panel. Set false to render your own from onSelect. */
  panel?: boolean;
  readAloud?: boolean;
  lang?: () => string;
  onSelect?: (h: Hotspot | null) => void;
}

/**
 * Anchored markers (DOM buttons, keyboard accessible) with an optional built-in info panel.
 * Every hotspot needs a title, a body and a resolvable target; otherwise it throws.
 */
export class HotspotManager {
  private entries = new Map<string, Entry>();
  private activeId: string | null = null;
  private panelEl: HTMLDivElement | null = null;
  private speaker: Speaker | null = null;
  private tmp = new THREE.Vector3();
  private escHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.activeId) this.select(null);
  };

  constructor(private readonly opts: HotspotManagerOptions) {
    if (opts.panel !== false) this.buildPanel();
    if (opts.readAloud !== false && isSpeechOutputSupported()) this.speaker = createSpeaker();
    opts.overlay.ownerDocument.addEventListener("keydown", this.escHandler);
  }

  private resolveAnchor(input: HotspotInput): THREE.Vector3 {
    if (input.mesh) {
      const obj = findByName(this.opts.root, input.mesh);
      if (!obj) throw new TargetNotFoundError(input.mesh, "mesh");
      const c = worldCenter(obj);
      if (input.offset) c.add(this.tmp.set(...input.offset));
      return c;
    }
    if (input.position) return new THREE.Vector3(...input.position);
    throw new TargetNotFoundError("(no target given)", "mesh");
  }

  add(input: HotspotInput): { hotspot: Hotspot; previous: Hotspot | undefined } {
    if (!input.id) throw new Error("Hotspot needs an id");
    if (!input.title?.trim() || !input.body?.trim()) throw new Error(`Hotspot "${input.id}" needs a title and a body`);
    const kind = input.kind ?? "hotspot";
    // keep several markers on one mesh from stacking exactly on top of each other
    if (input.mesh && !input.offset) {
      const siblings = [...this.entries.values()].filter((e) => e.data.mesh === input.mesh && e.data.id !== input.id).length;
      if (siblings > 0) {
        const target = findByName(this.opts.root, input.mesh);
        const r = target ? new THREE.Box3().setFromObject(target).getBoundingSphere(new THREE.Sphere()).radius : 1;
        const angle = siblings * 2.4;
        input = { ...input, offset: [Math.cos(angle) * r * 0.45, Math.sin(angle) * r * 0.45 + r * 0.2, 0] };
      }
    }
    const anchor = this.resolveAnchor(input); // throws before any DOM is touched
    const previous = this.entries.get(input.id)?.data;
    if (previous) this.remove(input.id);

    const data: Hotspot = { ...input, kind };
    const el = this.opts.overlay.ownerDocument.createElement("button");
    el.type = "button";
    el.className = "specter-marker";
    el.dataset.kind = kind;
    el.dataset.hotspotId = data.id;
    el.setAttribute("aria-label", `${kind === "note" ? "Note" : "Hotspot"}: ${data.title}`);
    el.setAttribute("aria-haspopup", "dialog");
    el.textContent = kind === "note" ? "✎" : "";
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      this.select(this.activeId === data.id ? null : data.id);
    });
    this.opts.overlay.appendChild(el);
    this.entries.set(data.id, { data, el, anchor });
    return { hotspot: data, previous };
  }

  update(id: string, patch: { title?: string; body?: string }): { previous: Hotspot } {
    const e = this.entries.get(id);
    if (!e) throw new TargetNotFoundError(id, "hotspot");
    const previous = { ...e.data };
    if (patch.title !== undefined) {
      if (!patch.title.trim()) throw new Error("Hotspot title cannot be empty");
      e.data.title = patch.title;
    }
    if (patch.body !== undefined) {
      if (!patch.body.trim()) throw new Error("Hotspot body cannot be empty");
      e.data.body = patch.body;
    }
    e.el.setAttribute("aria-label", `${e.data.kind === "note" ? "Note" : "Hotspot"}: ${e.data.title}`);
    if (this.activeId === id) this.renderPanel(e.data);
    return { previous };
  }

  remove(id: string): Hotspot | undefined {
    const e = this.entries.get(id);
    if (!e) return undefined;
    if (this.activeId === id) this.select(null);
    e.el.remove();
    this.entries.delete(id);
    return e.data;
  }

  get(id: string): Hotspot | undefined {
    return this.entries.get(id)?.data;
  }

  list(): Hotspot[] {
    return [...this.entries.values()].map((e) => e.data);
  }

  get active(): Hotspot | null {
    return this.activeId ? (this.entries.get(this.activeId)?.data ?? null) : null;
  }

  select(id: string | null): void {
    this.speaker?.stop();
    const prev = this.activeId ? this.entries.get(this.activeId) : undefined;
    if (prev) prev.el.dataset.active = "false";
    const next = id ? this.entries.get(id) : undefined;
    this.activeId = next ? id : null;
    if (next) {
      next.el.dataset.active = "true";
      this.renderPanel(next.data);
    } else if (this.panelEl) {
      this.panelEl.hidden = true;
    }
    this.opts.onSelect?.(next?.data ?? null);
  }

  /** Recompute world anchors, for example after a model swap, a pack load or a mesh move. */
  refreshAnchors(): void {
    for (const e of this.entries.values()) {
      try {
        e.anchor = this.resolveAnchor(e.data);
      } catch {
        /* target vanished: keep the old anchor and hide the marker until it returns */
      }
    }
  }

  /** Re-check that each mesh-anchored hotspot still resolves. Returns ids that no longer do. */
  unresolved(): string[] {
    const bad: string[] = [];
    for (const e of this.entries.values()) {
      if (e.data.mesh && !findByName(this.opts.root, e.data.mesh)) bad.push(e.data.id);
    }
    return bad;
  }

  /** Called every frame: project anchors to screen space. */
  updateScreen(width: number, height: number): void {
    for (const e of this.entries.values()) {
      const target = e.data.mesh ? findByName(this.opts.root, e.data.mesh) : null;
      let hidden = false;
      if (target) {
        for (let o: THREE.Object3D | null = target; o; o = o.parent) {
          if (!o.visible) {
            hidden = true;
            break;
          }
        }
        if (!hidden) {
          worldCenter(target, e.anchor);
          if (e.data.offset) e.anchor.add(this.tmp.set(...e.data.offset));
        }
      }
      this.tmp.copy(e.anchor).project(this.opts.camera);
      const behind = this.tmp.z > 1 || this.tmp.z < -1;
      const x = (this.tmp.x * 0.5 + 0.5) * width;
      const y = (-this.tmp.y * 0.5 + 0.5) * height;
      const off = x < -20 || y < -20 || x > width + 20 || y > height + 20;
      e.el.dataset.hidden = hidden || behind || off ? "true" : "false";
      e.el.style.setProperty("--sx", `${x.toFixed(1)}px`);
      e.el.style.setProperty("--sy", `${y.toFixed(1)}px`);
    }
  }

  /** Pick a hotspot from a raycast hit (clicking the mesh itself). */
  pickByObject(hit: THREE.Object3D): string | null {
    for (const e of this.entries.values()) {
      if (!e.data.mesh) continue;
      const target = findByName(this.opts.root, e.data.mesh);
      if (!target) continue;
      for (let o: THREE.Object3D | null = hit; o; o = o.parent) {
        if (o === target) return e.data.id;
      }
    }
    return null;
  }

  private buildPanel(): void {
    const doc = this.opts.overlay.ownerDocument;
    const panel = doc.createElement("div");
    panel.className = "specter-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-live", "polite");
    panel.hidden = true;
    this.opts.overlay.appendChild(panel);
    this.panelEl = panel;
  }

  private renderPanel(h: Hotspot): void {
    const panel = this.panelEl;
    if (!panel) return;
    const doc = panel.ownerDocument;
    panel.replaceChildren();
    panel.setAttribute("aria-label", h.title);
    const title = doc.createElement("h3");
    title.textContent = h.title;
    const body = doc.createElement("p");
    body.textContent = h.body;
    const close = doc.createElement("button");
    close.type = "button";
    close.className = "specter-close";
    close.setAttribute("aria-label", "Close");
    close.textContent = "✕";
    close.addEventListener("click", () => this.select(null));
    panel.append(close, title, body);
    if (this.speaker && this.opts.readAloud !== false) {
      const actions = doc.createElement("div");
      actions.className = "specter-actions";
      const read = doc.createElement("button");
      read.type = "button";
      read.textContent = "🔊 Read aloud";
      read.addEventListener("click", () => {
        if (this.speaker?.speaking) {
          this.speaker.stop();
          read.textContent = "🔊 Read aloud";
          return;
        }
        read.textContent = "⏹ Stop";
        this.speaker?.speak(`${h.title}. ${h.body}`, { lang: this.opts.lang?.(), onEnd: () => (read.textContent = "🔊 Read aloud") });
      });
      actions.append(read);
      panel.append(actions);
    }
    panel.hidden = false;
  }

  /** Show a panel that is not tied to a hotspot marker (interactions such as "when clicked, show ..."). */
  showMessage(title: string, body: string): void {
    this.select(null);
    this.renderPanel({ id: "__message", kind: "hotspot", title, body, position: [0, 0, 0] });
  }

  hideMessage(): void {
    if (!this.activeId && this.panelEl) this.panelEl.hidden = true;
  }

  clear(): void {
    this.select(null);
    for (const e of this.entries.values()) e.el.remove();
    this.entries.clear();
  }

  destroy(): void {
    this.speaker?.stop();
    this.clear();
    this.panelEl?.remove();
    this.opts.overlay.ownerDocument.removeEventListener("keydown", this.escHandler);
  }
}
